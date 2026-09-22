"use client";

import { updateLeadDistributor } from "@/app/actions/leads";
import { CrmMenuSelect } from "@/components/crm-menu-select";
import type { DistributorOption } from "@/lib/distributors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LeadDistributorSelect({
  leadId,
  options,
  distributorId,
  onSaved,
  appearance = "field",
  emptyLabel = "Selecione o distribuidor",
  portalRoot = null,
  wide = false,
}: {
  leadId: string;
  options: DistributorOption[];
  distributorId: string | null;
  onSaved?: (distributorId: string | null) => void;
  appearance?: "toolbar" | "row" | "field";
  emptyLabel?: string;
  portalRoot?: HTMLElement | null;
  wide?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(distributorId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(distributorId ?? "");
  }, [distributorId]);

  const known = !value || options.some((option) => option.id === value);

  return (
    <div className={appearance === "toolbar" ? "contents" : "min-w-0"}>
      <CrmMenuSelect
        label="Distribuidor"
        searchable
        portalRoot={portalRoot}
        wide={wide}
        variant={appearance}
        value={known ? value : ""}
        disabled={loading || options.length === 0}
        options={[
          { value: "", label: options.length === 0 ? "Nenhum cadastrado" : emptyLabel },
          ...options.map((option) => ({ value: option.id, label: option.name })),
        ]}
        onChange={(next) => {
          setValue(next);
          setLoading(true);
          setError(null);
          void (async () => {
            try {
              const result = await updateLeadDistributor({
                leadId,
                distributorId: next || null,
              });
              if (!result.ok) {
                setError(result.error ?? "Não foi possível salvar o distribuidor.");
                setValue(distributorId ?? "");
                return;
              }
              onSaved?.(next || null);
              router.refresh();
            } catch {
              setError("Não foi possível salvar o distribuidor.");
              setValue(distributorId ?? "");
            } finally {
              setLoading(false);
            }
          })();
        }}
      />
      {options.length === 0 ? (
        <Link
          href="/settings/distribuidores"
          className="mt-1 inline-block text-[11px] font-semibold text-[var(--vp-wine)] underline-offset-2 hover:underline"
        >
          Cadastrar em Configurações
        </Link>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-[var(--vp-error)]">{error}</p> : null}
    </div>
  );
}
