import { listLostReasons } from "@/app/actions/lost-reasons";
import { LostReasonsManager } from "./lost-reasons-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const result = await listLostReasons();
  if (!result.ok) {
    return (
      <div className="space-y-3">
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Configurações
        </h1>
        <p role="alert" className="text-sm text-[var(--vp-error)]">
          {result.error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Configurações
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--vp-ink-muted)]">
          Listas comerciais que o funil usa na hora de classificar. Etapas do kanban
          continuam fixas; o que muda com frequência fica aqui.
        </p>
      </div>
      <LostReasonsManager initialReasons={result.reasons} canManage={result.canManage} />
    </div>
  );
}
