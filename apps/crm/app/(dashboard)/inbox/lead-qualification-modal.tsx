"use client";

import { lookupLeadCep, updateConversationLeadQualification } from "@/app/actions/leads";
import { formatCaptureZip } from "@/lib/lead-capture";
import { CityAutocompleteInput } from "@/components/city-autocomplete-input";
import { formatLocalizedInteger } from "@/lib/parse-localized-integer";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function formatInitialInt(value: number | null): string {
  if (value == null) return "";
  return formatLocalizedInteger(value);
}

type StageOption = {
  id: string;
  name: string;
};

type Props = {
  conversationId: string;
  initialCategory: string | null;
  initialStageId: string | null;
  initialState: string | null;
  initialCity: string | null;
  initialZipCode: string | null;
  initialStreet: string | null;
  initialNeighborhood: string | null;
  initialWeeklyBreadConsumption: number | null;
  initialCompanyName: string | null;
  initialCnpj: string | null;
  initialBreadType: string | null;
  initialBreadWeightGrams: number | null;
  stages: StageOption[];
};

export function LeadQualificationModal(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState(props.initialCategory ?? "");
  const [stageId, setStageId] = useState(props.initialStageId ?? "");
  const [state, setState] = useState(props.initialState ?? "");
  const [city, setCity] = useState(props.initialCity ?? "");
  const [zipCode, setZipCode] = useState(formatCaptureZip(props.initialZipCode ?? ""));
  const [street, setStreet] = useState(props.initialStreet ?? "");
  const [neighborhood, setNeighborhood] = useState(props.initialNeighborhood ?? "");
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [weeklyBreadConsumption, setWeeklyBreadConsumption] = useState(
    formatInitialInt(props.initialWeeklyBreadConsumption),
  );
  const [companyName, setCompanyName] = useState(props.initialCompanyName ?? "");
  const [cnpj, setCnpj] = useState(props.initialCnpj ?? "");
  const [breadType, setBreadType] = useState(props.initialBreadType ?? "");
  const [breadWeightGrams, setBreadWeightGrams] = useState(
    formatInitialInt(props.initialBreadWeightGrams),
  );

  useEffect(() => {
    setCategory(props.initialCategory ?? "");
    setStageId(props.initialStageId ?? "");
    setState(props.initialState ?? "");
    setCity(props.initialCity ?? "");
    setZipCode(formatCaptureZip(props.initialZipCode ?? ""));
    setStreet(props.initialStreet ?? "");
    setNeighborhood(props.initialNeighborhood ?? "");
    setCepStatus(null);
    setWeeklyBreadConsumption(formatInitialInt(props.initialWeeklyBreadConsumption));
    setCompanyName(props.initialCompanyName ?? "");
    setCnpj(props.initialCnpj ?? "");
    setBreadType(props.initialBreadType ?? "");
    setBreadWeightGrams(formatInitialInt(props.initialBreadWeightGrams));
    setError(null);
    setOpen(false);
  }, [
    props.conversationId,
    props.initialCategory,
    props.initialStageId,
    props.initialState,
    props.initialCity,
    props.initialZipCode,
    props.initialStreet,
    props.initialNeighborhood,
    props.initialWeeklyBreadConsumption,
    props.initialCompanyName,
    props.initialCnpj,
    props.initialBreadType,
    props.initialBreadWeightGrams,
  ]);

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await updateConversationLeadQualification({
      conversationId: props.conversationId,
      category: category.trim() || null,
      stageId: stageId.trim() || null,
      state: state.trim() || null,
      city: city.trim() || null,
      zipCode: zipCode.trim() || null,
      street: street.trim() || null,
      neighborhood: neighborhood.trim() || null,
      weeklyBreadConsumption: weeklyBreadConsumption.trim() || null,
      companyName: companyName.trim() || null,
      cnpj: cnpj.trim() || null,
      breadType: breadType.trim() || null,
      breadWeightGrams: breadWeightGrams.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Erro ao salvar.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-[var(--border)] bg-[var(--vp-paper-pure)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--vp-paper)]"
      >
        Editar
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--vp-paper-pure)] p-4 shadow-[var(--sh-md)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Qualificação do lead</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                Categoria de cliente
                <select
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">— SEM MARCAÇÃO —</option>
                  <option value="hamburgueria">HAMBURGUERIA</option>
                  <option value="distribuidor">DISTRIBUIDOR</option>
                  <option value="parceiros">PARCEIROS</option>
                  <option value="outros">OUTROS</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Etapa do funil
                <select
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                >
                  <option value="">— NÃO DEFINIDA —</option>
                  {props.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Estado
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="UF"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Cidade
                <CityAutocompleteInput
                  className="w-full rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={city}
                  onChange={setCity}
                  stateFilter={state}
                  placeholder="Digite para ver sugestões"
                  disabled={saving}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                CEP
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={zipCode}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  onChange={(e) => {
                    const formatted = formatCaptureZip(e.target.value);
                    setZipCode(formatted);
                    const digits = formatted.replace(/\D/g, "");
                    if (digits.length !== 8) {
                      setCepStatus(null);
                      return;
                    }
                    setCepStatus("Buscando CEP…");
                    void lookupLeadCep(digits).then((result) => {
                      if (!result.ok) {
                        setCepStatus(result.error);
                        return;
                      }
                      setStreet(result.address.street ?? "");
                      setNeighborhood(result.address.neighborhood ?? "");
                      setCity(result.address.city);
                      setState(result.address.state);
                      setCepStatus(null);
                    });
                  }}
                />
                {cepStatus ? <span className="text-[11px] text-[var(--muted)]">{cepStatus}</span> : null}
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Logradouro
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Bairro
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Quantidade semanal de pães
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={weeklyBreadConsumption}
                  onChange={(e) => setWeeklyBreadConsumption(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 40.000"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Nome da empresa
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                CNPJ
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Tipo de pão
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={breadType}
                  onChange={(e) => setBreadType(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Gramatura (g)
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={breadWeightGrams}
                  onChange={(e) => setBreadWeightGrams(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 30 ou 30g"
                />
              </label>
            </div>

            {error ? <p className="mt-3 text-xs text-[var(--vp-error)]">{error}</p> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-xs"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--vp-gold)] disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
