"use client";

import { lostReasonNamesForSelect } from "@/lib/lost-reasons";
import type { LostReasonDTO } from "@/lib/lost-reasons";

export function LostReasonSelect({
  reasons,
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  reasons: readonly LostReasonDTO[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const options = lostReasonNamesForSelect(reasons, value);
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || options.length === 0}
    >
      <option value="">Selecione um motivo</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
