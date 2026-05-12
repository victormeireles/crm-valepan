"use client";

import { updateConversationLeadQualification } from "@/app/actions/leads";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [zipCode, setZipCode] = useState(props.initialZipCode ?? "");
  const [weeklyBreadConsumption, setWeeklyBreadConsumption] = useState(
    props.initialWeeklyBreadConsumption != null ? String(props.initialWeeklyBreadConsumption) : "",
  );
  const [companyName, setCompanyName] = useState(props.initialCompanyName ?? "");
  const [cnpj, setCnpj] = useState(props.initialCnpj ?? "");
  const [breadType, setBreadType] = useState(props.initialBreadType ?? "");
  const [breadWeightGrams, setBreadWeightGrams] = useState(
    props.initialBreadWeightGrams != null ? String(props.initialBreadWeightGrams) : "",
  );

  useEffect(() => {
    setCategory(props.initialCategory ?? "");
    setStageId(props.initialStageId ?? "");
    setState(props.initialState ?? "");
    setCity(props.initialCity ?? "");
    setZipCode(props.initialZipCode ?? "");
    setWeeklyBreadConsumption(
      props.initialWeeklyBreadConsumption != null ? String(props.initialWeeklyBreadConsumption) : "",
    );
    setCompanyName(props.initialCompanyName ?? "");
    setCnpj(props.initialCnpj ?? "");
    setBreadType(props.initialBreadType ?? "");
    setBreadWeightGrams(
      props.initialBreadWeightGrams != null ? String(props.initialBreadWeightGrams) : "",
    );
    setError(null);
    setOpen(false);
  }, [
    props.conversationId,
    props.initialCategory,
    props.initialStageId,
    props.initialState,
    props.initialCity,
    props.initialZipCode,
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
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                CEP
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                Quantidade semanal de pães
                <input
                  className="rounded border border-[var(--border)] bg-[var(--vp-paper)] px-2 py-1.5 text-sm"
                  value={weeklyBreadConsumption}
                  onChange={(e) => setWeeklyBreadConsumption(e.target.value)}
                  inputMode="numeric"
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
                  inputMode="numeric"
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
