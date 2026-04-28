"use client";

import { updateSampleShipmentDetails } from "@/app/actions/samples";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SampleRowEdit(props: {
  shipmentId: string;
  leadId: string | null;
  network: string;
  contactName: string;
  leadPhone: string;
  addressLine: string;
  businessHours: string;
  breadType: string;
}) {
  const router = useRouter();
  const [network, setNetwork] = useState(props.network);
  const [contactName, setContactName] = useState(props.contactName);
  const [leadPhone, setLeadPhone] = useState(props.leadPhone);
  const [addressLine, setAddressLine] = useState(props.addressLine);
  const [businessHours, setBusinessHours] = useState(props.businessHours);
  const [breadType, setBreadType] = useState(props.breadType);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await updateSampleShipmentDetails({
      shipmentId: props.shipmentId,
      leadId: props.leadId,
      network,
      contactName,
      leadPhone,
      addressLine,
      businessHours,
      breadType,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro");
      return;
    }
    router.refresh();
  }

  const inputClass =
    "w-full min-w-[9rem] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px]";

  return (
    <>
      <td className="px-2 py-1.5">
        <input className={inputClass} value={network} onChange={(e) => setNetwork(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <input className={inputClass} value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <input className={inputClass} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={inputClass}
          value={businessHours}
          onChange={(e) => setBusinessHours(e.target.value)}
        />
      </td>
      <td className="px-2 py-1.5">
        <input className={inputClass} value={breadType} onChange={(e) => setBreadType(e.target.value)} />
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-[var(--vp-gold)] disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {err ? <p className="mt-1 text-[11px] text-[var(--vp-error)]">{err}</p> : null}
      </td>
    </>
  );
}
