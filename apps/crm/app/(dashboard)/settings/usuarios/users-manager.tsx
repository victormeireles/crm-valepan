"use client";

import { createCrmUser, deleteCrmUser, setCrmUserPassword, setCrmUserRole, updateCrmUserIdentity } from "@/app/actions/crm-users";
import {
  CRM_USER_ROLE_LABEL,
  CRM_USER_ROLES,
  refuseCrmUserDeletion,
  type CrmUserDTO,
  type CrmUserRole,
} from "@/lib/crm-users";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "mt-1 min-h-11 w-full rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-[13px] font-semibold normal-case tracking-normal text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-soft)]";
const labelClass = "space-y-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]";

export function UsersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: CrmUserDTO[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CrmUserRole>("comercial");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function replaceUser(user: CrmUserDTO) {
    setUsers((current) => {
      const next = current.some((item) => item.id === user.id)
        ? current.map((item) => (item.id === user.id ? user : item))
        : [...current, user];
      return next;
    });
  }

  function removeUser(userId: string) {
    setUsers((current) => current.filter((item) => item.id !== userId));
  }

  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <section className="space-y-6">
      <div>
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Usuários
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Só um administrador cria contas, edita nome e e-mail, muda papéis e remove usuários. A pessoa entra
          com o e-mail e a senha definidos aqui, e não consegue se promover.
        </p>
      </div>

      <form
        className="grid gap-3 rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (creating) return;
          setCreating(true);
          setError(null);
          setNotice(null);
          void (async () => {
            const result = await createCrmUser({ fullName, email, password, role });
            setCreating(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            replaceUser(result.user);
            setFullName("");
            setEmail("");
            setPassword("");
            setRole("comercial");
            setNotice("Conta criada. Entregue a senha por um canal seguro. Ela não fica salva na tela.");
            router.refresh();
          })();
        }}
      >
        <label className={labelClass}>
          Nome
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required className={inputClass} />
        </label>
        <label className={labelClass}>
          E-mail
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Senha inicial
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Papel
          <select value={role} onChange={(event) => setRole(event.target.value as CrmUserRole)} className={inputClass}>
            {CRM_USER_ROLES.map((item) => (
              <option key={item} value={item}>{CRM_USER_ROLE_LABEL[item]}</option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-[var(--vp-wine)] px-4 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
          >
            {creating ? "Criando…" : "Cadastrar usuário"}
          </button>
        </div>
      </form>

      {error ? <p role="alert" className="text-sm text-[var(--vp-error)]">{error}</p> : null}
      {notice ? <p className="text-sm text-[var(--vp-ink-muted)]">{notice}</p> : null}

      <ul className="overflow-hidden rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)]">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isCurrent={user.id === currentUserId}
            canRemove={refuseCrmUserDeletion({
              actorId: currentUserId,
              targetId: user.id,
              targetIsAdmin: user.role === "admin",
              adminCount,
            }) === null}
            busy={busyId === user.id}
            onError={setError}
            onNotice={setNotice}
            onSaved={(next) => {
              replaceUser(next);
              router.refresh();
            }}
            onDeleted={() => {
              removeUser(user.id);
              router.refresh();
            }}
            onBusy={(busy) => setBusyId(busy ? user.id : null)}
          />
        ))}
      </ul>
    </section>
  );
}

function editableEmail(email: string): string {
  return email === "sem e-mail" ? "" : email;
}

function UserRow({
  user,
  isCurrent,
  canRemove,
  busy,
  onBusy,
  onSaved,
  onDeleted,
  onError,
  onNotice,
}: {
  user: CrmUserDTO;
  isCurrent: boolean;
  canRemove: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (user: CrmUserDTO) => void;
  onDeleted: () => void;
  onError: (error: string | null) => void;
  onNotice: (notice: string | null) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [email, setEmail] = useState(editableEmail(user.email));
  const [role, setRole] = useState<CrmUserRole>(user.role ?? "comercial");
  const [password, setPassword] = useState("");
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);

  const identityChanged = fullName.trim() !== (user.fullName ?? "")
    || email.trim().toLowerCase() !== editableEmail(user.email);
  const unchanged = !identityChanged && role === user.role && password.length === 0;

  return (
    <li className="grid gap-3 border-b border-[var(--vp-ink-line)] px-4 py-4 last:border-b-0">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          Nome
          {isCurrent ? <span className="ml-2 normal-case tracking-normal text-[var(--vp-ink-soft)]">você</span> : null}
          <input
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              setConfirmingRemoval(false);
            }}
            maxLength={80}
            disabled={busy}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setConfirmingRemoval(false);
            }}
            autoComplete="off"
            disabled={busy}
            className={inputClass}
          />
        </label>
      </div>
      {user.role ? null : (
        <p className="text-xs font-semibold text-[var(--vp-wine)]">Conta sem acesso ao CRM</p>
      )}
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
        <label className={labelClass}>
          Papel
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value as CrmUserRole);
              setConfirmingRemoval(false);
            }}
            disabled={busy}
            className={inputClass}
          >
            {CRM_USER_ROLES.map((item) => (
              <option key={item} value={item}>{CRM_USER_ROLE_LABEL[item]}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Nova senha
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setConfirmingRemoval(false);
            }}
            autoComplete="new-password"
            placeholder="Opcional"
            disabled={busy}
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || unchanged}
            onClick={() => {
              setPending("save");
              onBusy(true);
              onError(null);
              onNotice(null);
              setConfirmingRemoval(false);
              void (async () => {
                try {
                  if (identityChanged) {
                    const result = await updateCrmUserIdentity({ userId: user.id, fullName, email });
                    if (!result.ok) {
                      onError(result.error);
                      return;
                    }
                    onSaved(result.user);
                    setFullName(result.user.fullName ?? "");
                    setEmail(editableEmail(result.user.email));
                    onNotice("Nome e e-mail atualizados.");
                  }
                  if (role !== user.role) {
                    const result = await setCrmUserRole({ userId: user.id, role });
                    if (!result.ok) {
                      onError(result.error);
                      return;
                    }
                    onSaved(result.user);
                  }
                  if (password.length > 0) {
                    const result = await setCrmUserPassword({ userId: user.id, password });
                    if (!result.ok) {
                      onError(result.error);
                      return;
                    }
                    setPassword("");
                    onNotice("Senha atualizada. Ela não fica salva na tela.");
                  }
                } finally {
                  onBusy(false);
                  setPending(null);
                }
              })();
            }}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-[var(--vp-wine)] px-4 text-[13px] font-bold text-[var(--vp-gold)] disabled:opacity-50"
          >
            {pending === "save" ? "Salvando…" : "Salvar"}
          </button>
          {canRemove ? (
            confirmingRemoval ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPending("remove");
                    onBusy(true);
                    onError(null);
                    onNotice(null);
                    void (async () => {
                      try {
                        const result = await deleteCrmUser({ userId: user.id });
                        if (!result.ok) {
                          onError(result.error);
                          setConfirmingRemoval(false);
                          return;
                        }
                        onNotice("Conta removida. Leads e oportunidades dessa pessoa ficam sem responsável.");
                        onDeleted();
                      } finally {
                        onBusy(false);
                        setPending(null);
                      }
                    })();
                  }}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-[var(--vp-error)] px-4 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {pending === "remove" ? "Removendo…" : "Confirmar remoção"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingRemoval(false)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[var(--vp-ink-line)] px-4 text-[13px] font-bold text-[var(--vp-ink-body)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onError(null);
                  setConfirmingRemoval(true);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[var(--vp-error)] px-4 text-[13px] font-bold text-[var(--vp-error)] disabled:opacity-50"
              >
                Remover
              </button>
            )
          ) : null}
        </div>
      </div>
    </li>
  );
}
