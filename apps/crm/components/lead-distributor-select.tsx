"use client";

import { updateLeadDistributor } from "@/app/actions/leads";
import type { DistributorOption } from "@/lib/distributors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LeadDistributorSelect({
  leadId,
  options,
  distributorId,
  onSaved,
  className,
  emptyLabel = "Selecione o distribuidor",
}: {
  leadId: string;
  options: DistributorOption[];
  distributorId: string | null;
  onSaved?: (distributorId: string | null) => void;
  className?: string;
  emptyLabel?: string;
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
    <div className="contents">
      <select
        aria-label="Distribuidor"
        value={known ? value : ""}
        disabled={loading || options.length === 0}
        onChange={(event) => {
          const next = event.target.value;
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
        className={className}
      >
        <option value="">{options.length === 0 ? "Nenhum cadastrado" : emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {options.length === 0 ? (
        <Link
          href="/settings/distribuidores"
          className="text-[11px] font-semibold text-[var(--vp-wine)] underline-offset-2 hover:underline"
        >
          Cadastrar em Configurações
        </Link>
      ) : null}
      {error ? <p className="text-[11px] text-[var(--vp-error)]">{error}</p> : null}
    </div>
  );
}
