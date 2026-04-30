"use client";

import { CategoryBadge } from "@/components/lead-identity";
import { removeLeadFromCategoryGrid, updateLeadCategoryContactInfo } from "@/app/actions/leads";
import { NETWORK_TYPE_OPTIONS } from "@/lib/network-types";
import { SEND_VIA_OPTIONS } from "@/lib/send-via-options";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

const LEAD_STATUS_OPTIONS = ["em negociação", "cliente"] as const;

export function LeadCategoryRowEdit(props: {
  leadId: string | null;
  clientCategory: "hamburgueria" | "distribuidor" | "parceiros" | "outros";
  distributorName: string;
  distributorLocked?: boolean;
  leadStatus: string;
  networkType: string;
  contactName: string;
  leadPhone: string;
  city: string;
  companyDocument: string;
}) {
  const router = useRouter();
  const [leadId, setLeadId] = useState<string | null>(props.leadId);
  const [distributorName, setDistributorName] = useState(props.distributorName);
  const [leadStatus, setLeadStatus] = useState(props.leadStatus);
  const [networkType, setNetworkType] = useState(props.networkType);
  const [contactName, setContactName] = useState(props.contactName);
  const [leadPhone, setLeadPhone] = useState(props.leadPhone);
  const [city, setCity] = useState(props.city);
  const [companyDocument, setCompanyDocument] = useState(props.companyDocument);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    setLeadId(props.leadId);
    setDistributorName(props.distributorName);
    setLeadStatus(props.leadStatus);
    setNetworkType(props.networkType);
    setContactName(props.contactName);
    setLeadPhone(formatPhoneForDisplay(props.leadPhone));
    setCity(props.city);
    setCompanyDocument(props.companyDocument);
  }, [
    props.leadId,
    props.distributorName,
    props.leadStatus,
    props.networkType,
    props.contactName,
    props.leadPhone,
    props.city,
    props.companyDocument,
  ]);

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
    setOkMsg(null);
    try {
      const res = await updateLeadCategoryContactInfo({
        leadId,
        clientCategory: props.clientCategory,
        distributorName: distributorName.trim() || null,
        leadStatus: leadStatus.trim().toLowerCase() || null,
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
      setEditing(false);
      setOkMsg("Informações salvas.");
      router.refresh();
    } catch {
      setSaving(false);
      setErr("Falha inesperada ao salvar. Tente novamente.");
    }
  }

  async function remove() {
    if (!leadId) {
      setDistributorName(props.distributorLocked ? props.distributorName : "");
      setLeadStatus("");
      setNetworkType("");
      setContactName("");
      setLeadPhone("");
      setCity("");
      setCompanyDocument("");
      setErr(null);
      setOkMsg(null);
      return;
    }
    setDeleting(true);
    setErr(null);
    setOkMsg(null);
    const res = await removeLeadFromCategoryGrid({ leadId });
    setDeleting(false);
    if (!res.ok) {
      setErr(res.error ?? "Erro ao excluir");
      return;
    }
    router.refresh();
  }

  function onEnterSave(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    if (!editing) return;
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
  const actionControlClass =
    "h-6 w-[5rem] rounded border border-[var(--border)] bg-[var(--vp-surface-low)] px-1 text-[9px] font-medium text-[var(--foreground)] hover:bg-[var(--vp-paper)] disabled:opacity-50";
  const actionButtonClass =
    "h-6 w-[4rem] rounded border border-[var(--border)] bg-[var(--vp-surface-low)] px-1 text-[9px] font-medium text-[var(--foreground)] hover:bg-[var(--vp-paper)] disabled:opacity-50";
  const fieldsDisabled = !editing || saving || deleting;
  const fieldClass = `${inputClass} ${fieldsDisabled ? "bg-[var(--card)]" : ""}`;

  return (
    <>
      <td className="px-2 py-1.5">
        <input
          className={`${fieldClass} ${props.distributorLocked || fieldsDisabled ? "bg-[var(--card)]" : ""}`}
          list={`lead-distributor-options-${leadId ?? "pending"}`}
          value={distributorName}
          onChange={(e) => setDistributorName(e.target.value)}
          onKeyDown={onEnterSave}
          readOnly={!!props.distributorLocked || fieldsDisabled}
          placeholder={props.distributorLocked ? "" : "Selecione ou digite"}
          disabled={fieldsDisabled}
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
          className={`${fieldClass} ${fieldsDisabled ? "bg-[var(--card)]" : ""}`}
          name="networkType"
          value={networkType}
          onChange={(e) => setNetworkType(e.target.value)}
          onKeyDown={onEnterSave}
          disabled={fieldsDisabled}
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
          className={fieldClass}
          name="companyDocument"
          value={companyDocument}
          onChange={(e) => setCompanyDocument(e.target.value)}
          onBlur={() => setCompanyDocument((prev) => formatCnpjForDisplay(prev))}
          onKeyDown={onEnterSave}
          disabled={fieldsDisabled}
          placeholder="CNPJ"
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <CategoryBadge category={props.clientCategory} size="sm" />
          <input
            className={`${fieldClass} min-w-0 flex-1`}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onKeyDown={onEnterSave}
            disabled={fieldsDisabled}
            placeholder="Nome do contato"
          />
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          className={fieldClass}
          name="leadPhone"
          value={leadPhone}
          onChange={(e) => setLeadPhone(e.target.value)}
          onBlur={() => setLeadPhone((prev) => formatPhoneForDisplay(prev))}
          onKeyDown={onEnterSave}
          disabled={fieldsDisabled}
          placeholder="Telefone"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={fieldClass}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={onEnterSave}
          disabled={fieldsDisabled}
          placeholder="Cidade"
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <select
            className={actionControlClass}
            name="leadStatus"
            value={leadStatus}
            onChange={(e) => setLeadStatus(e.target.value)}
            onKeyDown={onEnterSave}
            disabled={fieldsDisabled}
          >
            <option value="">STATUS</option>
            {LEAD_STATUS_OPTIONS.map((statusOpt) => (
              <option key={statusOpt} value={statusOpt}>
                {statusOpt.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setErr(null);
              setOkMsg(null);
            }}
            disabled={saving || deleting}
            className={actionButtonClass}
          >
            EDITAR
          </button>
          <button
            type="button"
            onClick={() => {
              const formattedPhone = formatPhoneForDisplay(leadPhone);
              const formattedDocument = formatCnpjForDisplay(companyDocument);
              setLeadPhone(formattedPhone);
              setCompanyDocument(formattedDocument);
              void save(formattedPhone, formattedDocument, false);
            }}
            disabled={fieldsDisabled}
            className={actionButtonClass}
          >
            {saving ? "SALVANDO..." : "SALVAR"}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving || deleting}
            className={actionButtonClass}
          >
            {deleting ? "EXCLUINDO..." : "EXCLUIR"}
          </button>
        </div>
        {saving ? <p className="mt-1 text-[11px] text-[var(--muted)]">Salvando...</p> : null}
        {err ? <p className="mt-1 text-[11px] text-[var(--vp-error)]">{err}</p> : null}
        {okMsg ? <p className="mt-1 text-[11px] text-emerald-600">{okMsg}</p> : null}
      </td>
    </>
  );
}
