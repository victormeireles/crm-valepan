"use server";

import {
  compareCrmUsers,
  parseCrmUserId,
  parseCrmUserRole,
  validateCrmPassword,
  validateNewCrmUser,
  wouldRemoveLastAdmin,
  type CrmUserDTO,
  type CrmUserRole,
} from "@/lib/crm-users";
import { createAdminSupabaseClient, crmTables as crmAdminTables } from "@/lib/supabase/admin";
import { createServerSupabaseClient, crmTables } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const crm = crmTables(supabase);
  const { data: profile, error } = await crm
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: "Não foi possível confirmar o seu acesso." };
  if (profile?.role !== "admin") {
    return { ok: false, error: "Só um administrador pode gerenciar usuários." };
  }
  return { ok: true, userId: user.id };
}

function accountLabel(user: { email?: string | null; user_metadata?: Record<string, unknown> }): {
  email: string;
  fullName: string | null;
} {
  const email = user.email?.trim().toLowerCase() || "sem e-mail";
  const rawName = user.user_metadata?.full_name;
  const fullName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
  return { email, fullName };
}

async function loadCrmUsers(): Promise<{ ok: true; users: CrmUserDTO[] } | { ok: false; error: string }> {
  const admin = createAdminSupabaseClient();
  const crm = crmAdminTables(admin);
  const authUsers: User[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { ok: false, error: "Não foi possível listar as contas." };
    authUsers.push(...data.users);
    if (data.users.length < 200) break;
  }

  const { data: profiles, error: profileError } = await crm.from("profiles").select("id, full_name, role");
  if (profileError) return { ok: false, error: "Não foi possível ler os perfis do CRM." };

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users = authUsers.map((user) => {
    const profile = profileById.get(user.id);
    const account = accountLabel(user);
    return {
      id: user.id,
      email: account.email,
      fullName: profile?.full_name?.trim() || account.fullName,
      role: profile ? parseCrmUserRole(profile.role) : null,
    };
  });

  users.sort(compareCrmUsers);
  return { ok: true, users };
}

export async function listCrmUsers(): Promise<
  { ok: true; currentUserId: string; users: CrmUserDTO[] } | { ok: false; error: string }
> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const users = await loadCrmUsers();
  if (!users.ok) return users;
  return { ok: true, currentUserId: admin.userId, users: users.users };
}

export async function createCrmUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: string;
}): Promise<{ ok: true; user: CrmUserDTO } | { ok: false; error: string }> {
  const actor = await requireAdmin();
  if (!actor.ok) return actor;

  const draft = validateNewCrmUser(input);
  if (!draft.ok) return draft;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: draft.email,
    password: draft.password,
    email_confirm: true,
    user_metadata: { full_name: draft.fullName },
    app_metadata: { role: draft.role },
  });
  if (error || !data.user) {
    const message = error?.message.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return { ok: false, error: "Já existe uma conta com este e-mail." };
    }
    return { ok: false, error: "Não foi possível criar a conta." };
  }

  const crm = crmAdminTables(admin);
  const { data: profile, error: profileError } = await crm
    .from("profiles")
    .select("id, role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: "A conta foi criada, mas o perfil não pôde ser confirmado." };

  if (!profile) {
    const { error: insertError } = await crm.from("profiles").insert({
      id: data.user.id,
      full_name: draft.fullName,
      role: draft.role,
    });
    if (insertError) return { ok: false, error: "A conta foi criada, mas o perfil do CRM não foi gravado." };
  }

  revalidatePath("/settings/usuarios");
  return {
    ok: true,
    user: {
      id: data.user.id,
      email: draft.email,
      fullName: draft.fullName,
      role: draft.role,
    },
  };
}

async function grantRole(
  userId: string,
  role: CrmUserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminSupabaseClient();
  const crm = crmAdminTables(admin);
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authUser.user) return { ok: false, error: "Conta não encontrada." };

  const { data: profile, error: profileError } = await crm
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, error: "Não foi possível ler o perfil." };

  if (wouldRemoveLastAdmin({
    targetIsAdmin: profile?.role === "admin",
    nextRole: role,
    adminCount: profile?.role === "admin"
      ? (await crm.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin")).count ?? 0
      : 0,
  })) {
    return { ok: false, error: "O CRM precisa manter pelo menos um administrador." };
  }

  const account = accountLabel(authUser.user);
  if (profile) {
    const { error: updateError } = await crm.from("profiles").update({ role }).eq("id", userId);
    if (updateError) return { ok: false, error: "Não foi possível atualizar o papel no CRM." };
  } else {
    const { error: insertError } = await crm.from("profiles").insert({
      id: userId,
      full_name: account.fullName,
      role,
    });
    if (insertError) return { ok: false, error: "Não foi possível liberar o acesso no CRM." };
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(authUser.user.app_metadata ?? {}), role },
  });
  if (metadataError) {
    return { ok: false, error: "O acesso foi atualizado, mas a conta não sincronizou. Salve o papel de novo." };
  }

  return { ok: true };
}

export async function setCrmUserRole(input: {
  userId: string;
  role: string;
}): Promise<{ ok: true; user: CrmUserDTO } | { ok: false; error: string }> {
  const actor = await requireAdmin();
  if (!actor.ok) return actor;

  const userId = parseCrmUserId(input.userId);
  const role = parseCrmUserRole(input.role);
  if (!userId || !role) return { ok: false, error: "Usuário ou papel inválido." };

  const granted = await grantRole(userId, role);
  if (!granted.ok) return granted;

  const users = await loadCrmUsers();
  const user = users.ok ? users.users.find((item) => item.id === userId) : null;
  revalidatePath("/settings/usuarios");
  if (!user) return { ok: false, error: "O papel foi salvo, mas a lista não pôde ser atualizada." };
  return { ok: true, user };
}

export async function setCrmUserPassword(input: {
  userId: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireAdmin();
  if (!actor.ok) return actor;

  const userId = parseCrmUserId(input.userId);
  const password = validateCrmPassword(input.password);
  if (!userId) return { ok: false, error: "Usuário inválido." };
  if (!password.ok) return password;

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: password.password });
  if (error) return { ok: false, error: "Não foi possível definir a nova senha." };
  return { ok: true };
}
