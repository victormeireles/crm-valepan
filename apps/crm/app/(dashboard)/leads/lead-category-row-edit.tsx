"use client";

import { updateLeadCategoryContactInfo } from "@/app/actions/leads";
import { NETWORK_TYPE_OPTIONS } from "@/lib/network-types";
import { SEND_VIA_OPTIONS } from "@/lib/send-via-options";
import { useRouter } from "next/navigation";
import { useState } from "react";

function formatPhoneForDisplay(input: string): string {
  const digits = input.replace(/\D/g, "");
  const normalized =
    digits.length >= 12 && digits.startsWith("55")
      ? digits.slice(2)
      : digits;

  if (normalized.length <= 2) return normalized;
  if (normalized.length <= 6) return `(${normalized.slice(0, 2)}) ${normalized.slice(2)}`;
  if (normalized.length <= 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6, 10)}`;
  }
  return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7, 11)}`;
}

function formatCnpjForDisplay(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function hasValidBrazilPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return true;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return true;
  return false;
}

export function LeadCategoryRowEdit(props: {
  leadId: string | null;
  clientCategory: "hamburgueria" | "distribuidor" | "parceiros" | "outros";
  distributorName: string;
  distributorLocked?: boolean;
  networkType: string;
  contactName: string;
  leadPhone: string;
  city: string;
  companyDocument: string;
}) {
  const router = useRouter();
  const [leadId, setLeadId] = useState<string | null>(props.leadId);
  const [distributorName, setDistributorName] = useState(props.distributorName);
  const [networkType, setNetworkType] = useState(props.networkType);
  const [contactName, setContactName] = useState(props.contactName);
  const [leadPhone, setLeadPhone] = useState(props.leadPhone);
  const [city, setCity] = useState(props.city);
  const [companyDocument, setCompanyDocument] = useState(props.companyDocument);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(
    overridePhone?: string,
    overrideDocument?: string,
    forceRequirePhone = false,
  ) {
    const phoneToSave = overridePhone ?? leadPhone;
    if (!leadId && !hasValidBrazilPhone(phoneToSave)) {
      if (forceRequirePhone) {
        setErr("Informe um telefone válido para criar o contato.");
      } else {
        setErr(null);
      }
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await updateLeadCategoryContactInfo({
      leadId,
      clientCategory: props.clientCategory,
      distributorName: distributorName.trim() || null,
      networkType: networkType.trim() || null,
      contactName,
      leadPhone: phoneToSave,
      city,
      companyDocument: overrideDocument ?? companyDocument,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao salvar");
      return;
    }
    if (res.leadId) setLeadId(res.leadId);
    router.refresh();
  }

  function onEnterSave(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputName = (e.currentTarget as HTMLInputElement | HTMLSelectElement).name;
    if (inputName === "leadPhone") {
      const formatted = formatPhoneForDisplay(leadPhone);
      setLeadPhone(formatted);
      void save(formatted, undefined, true);
      return;
    }
    if (inputName === "companyDocument") {
      const formatted = formatCnpjForDisplay(companyDocument);
      setCompanyDocument(formatted);
      void save(undefined, formatted, false);
      return;
    }
    void save(undefined, undefined, inputName === "leadPhone");
  }

  const inputClass =
    "w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px]";

  return (
    <>
      <td className="px-2 py-1.5">
        <input
          className={`${inputClass} ${props.distributorLocked ? "bg-[var(--vp-paper)]" : ""}`}
          list={`lead-distributor-options-${leadId ?? "pending"}`}
          value={distributorName}
          onChange={(e) => setDistributorName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={onEnterSave}
          readOnly={!!props.distributorLocked}
          placeholder={props.distributorLocked ? "" : "Selecione ou digite"}
          disabled={false}
        />
        {!props.distributorLocked ? (
          <datalist id={`lead-distributor-options-${leadId ?? "pending"}`}>
            {SEND_VIA_OPTIONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        ) : null}
      </td>
      <td className="px-2 py-1.5">
        <select
          className={inputClass}
          name="networkType"
          value={networkType}
          onChange={(e) => setNetworkType(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={onEnterSave}
        >
          <option value="">Classificação</option>
          {NETWORK_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt.toUpperCase()}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={inputClass}
          name="companyDocument"
          value={companyDocument}
          onChange={(e) => setCompanyDocument(e.target.value)}
          onBlur={() => {
            const formatted = formatCnpjForDisplay(companyDocument);
            setCompanyDocument(formatted);
            void save(undefined, formatted, false);
          }}
          onKeyDown={onEnterSave}
          disabled={false}
          placeholder="CNPJ"
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <input
            className={inputClass}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={onEnterSave}
            disabled={false}
            placeholder="Nome do contato"
          />
          <input
            className={inputClass}
            name="leadPhone"
            value={leadPhone}
            onChange={(e) => setLeadPhone(e.target.value)}
            onBlur={() => {
              const formatted = formatPhoneForDisplay(leadPhone);
              setLeadPhone(formatted);
              void save(formatted, undefined, true);
            }}
            onKeyDown={onEnterSave}
            disabled={false}
            placeholder="Telefone"
          />
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={inputClass}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={onEnterSave}
          disabled={false}
          placeholder="Cidade"
        />
        {saving ? <p className="mt-1 text-[11px] text-[var(--muted)]">Salvando...</p> : null}
        {err ? <p className="mt-1 text-[11px] text-[var(--vp-error)]">{err}</p> : null}
      </td>
    </>
  );
}
