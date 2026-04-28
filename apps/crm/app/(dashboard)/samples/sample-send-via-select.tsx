"use client";

import { updateSampleShipmentSendVia } from "@/app/actions/samples";
import { SEND_VIA_OPTIONS, type SendViaOption, isSendViaOption } from "@/lib/send-via-options";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function normalizeSendVia(raw: string | null | undefined): SendViaOption | "" {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return isSendViaOption(t) ? t : "";
}

export function SampleSendViaSelect({ shipmentId, sendVia }: { shipmentId: string; sendVia: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<SendViaOption | "">(normalizeSendVia(sendVia));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeSendVia(sendVia));
  }, [sendVia]);

  return (
    <div className="flex flex-col gap-1">
      <select
        className="max-w-[12rem] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px]"
        value={value}
        disabled={loading}
        onChange={(e) => {
          const nextRaw = e.target.value;
          const next = nextRaw.length > 0 ? (nextRaw as SendViaOption) : "";
          setValue(next);
          void (async () => {
            setLoading(true);
            setErr(null);
            const res = await updateSampleShipmentSendVia({
              shipmentId,
              sendVia: next.length > 0 ? next : null,
            });
            setLoading(false);
            if (!res.ok) {
              setErr(res.error ?? "Erro");
              setValue(normalizeSendVia(sendVia));
              return;
            }
            router.refresh();
          })();
        }}
      >
        <option value="">—</option>
        {SEND_VIA_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-[var(--vp-error)]">{err}</span> : null}
    </div>
  );
}
