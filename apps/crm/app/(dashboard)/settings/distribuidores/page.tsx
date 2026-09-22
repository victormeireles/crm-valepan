import { listDistributors } from "@/app/actions/distributors";
import { DistributorsManager } from "./distributors-manager";

export const dynamic = "force-dynamic";

export default async function DistributorsSettingsPage() {
  const result = await listDistributors();
  if (!result.ok) {
    return (
      <div className="space-y-3">
        <h1
          className="text-[40px] leading-none tracking-[0.01em] text-[var(--vp-wine)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Distribuidores
        </h1>
        <p role="alert" className="text-sm text-[var(--vp-error)]">
          {result.error}
        </p>
      </div>
    );
  }

  return (
    <DistributorsManager initialDistributors={result.distributors} canManage={result.canManage} />
  );
}
