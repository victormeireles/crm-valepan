"use client";

import { updateSampleShipmentStatus, type SampleShipmentStatus } from "@/app/actions/samples";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function normalizeStatus(raw: string): SampleShipmentStatus {
  const u = raw.trim().toUpperCase();
  return u === "ENVIADO" ? "ENVIADO" : "PENDENTE";
}

export function SampleStatusSelect({ shipmentId, status }: { shipmentId: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState<SampleShipmentStatus>(normalizeStatus(status));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeStatus(status));
  }, [status]);

  return (
    <div className="flex flex-col gap-1">
      <select
        className="max-w-[11rem] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px]"
        value={value}
        disabled={loading}
        onChange={(e) => {
          const next = e.target.value as SampleShipmentStatus;
          setValue(next);
          void (async () => {
            setLoading(true);
            setErr(null);
            const res = await updateSampleShipmentStatus({ shipmentId, status: next });
            setLoading(false);
            if (!res.ok) {
              setErr(res.error ?? "Erro");
              setValue(normalizeStatus(status));
              return;
            }
            router.refresh();
          })();
        }}
      >
        <option value="PENDENTE">PENDENTE</option>
        <option value="ENVIADO">ENVIADO</option>
      </select>
      {err ? <span className="text-[11px] text-[var(--vp-error)]">{err}</span> : null}
    </div>
  );
}
