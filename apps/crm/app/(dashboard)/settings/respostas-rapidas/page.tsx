import { listMessageTemplates } from "@/app/actions/message-templates";
import { QuickRepliesManager } from "./quick-replies-manager";

export const dynamic = "force-dynamic";

export default async function QuickRepliesSettingsPage() {
  const result = await listMessageTemplates();
  if (!result.ok) {
    return (
      <div className="space-y-3">
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Respostas rápidas
        </h1>
        <p role="alert" className="text-sm text-[var(--vp-error)]">
          {result.error}
        </p>
      </div>
    );
  }

  return <QuickRepliesManager initialTemplates={result.templates} canManage={result.canManage} />;
}
