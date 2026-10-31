import { listCrmUsers } from "@/app/actions/crm-users";
import { UsersManager } from "./users-manager";

export default async function CrmUsersPage() {
  const result = await listCrmUsers();
  if (!result.ok) {
    return (
      <section className="mx-auto max-w-lg rounded-[14px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] p-6">
        <h1
          className="text-[32px] leading-none text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Usuários
        </h1>
        <p className="mt-3 text-sm text-[var(--vp-ink-muted)]">{result.error}</p>
      </section>
    );
  }

  return <UsersManager initialUsers={result.users} currentUserId={result.currentUserId} />;
}
