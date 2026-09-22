import { listPipelineSubstages } from "@/app/actions/lost-reasons";
import { SubstagesManager } from "./substages-manager";

export const dynamic = "force-dynamic";

export default async function SubstagesSettingsPage() {
  const result = await listPipelineSubstages();
  if (!result.ok) {
    return (
      <div className="space-y-3">
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Subetapas
        </h1>
        <p role="alert" className="text-sm text-[var(--vp-error)]">
          {result.error}
        </p>
      </div>
    );
  }

  return <SubstagesManager initialSubstages={result.substages} canManage={result.canManage} />;
}
