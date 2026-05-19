"use client";

import { searchLeadsForPicker, type LeadPickerOption } from "@/app/actions/leads";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  name?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function LeadPickerInput({
  name = "lead_id",
  required,
  className,
  placeholder = "Buscar lead (nome, empresa ou telefone)",
  disabled,
}: Props) {
  const listId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LeadPickerOption | null>(null);
  const [suggestions, setSuggestions] = useState<LeadPickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchLeadsForPicker({ q }).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.ok) {
          setSuggestions(res.leads);
          setOpen(res.leads.length > 0);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  function pick(option: LeadPickerOption) {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
    setSuggestions([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setSuggestions([]);
  }

  const showList = open && suggestions.length > 0 && !disabled && !selected;

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      <div className="relative">
        <input
          className={className}
          value={query}
          onChange={(e) => {
            if (selected) clearSelection();
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!selected && suggestions.length > 0) setOpen(true);
          }}
          list={listId}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          aria-autocomplete="list"
          aria-expanded={showList}
        />
        <datalist id={listId}>
          {suggestions.map((lead) => (
            <option key={lead.id} value={lead.label} />
          ))}
        </datalist>
        {showList ? (
          <ul
            className="absolute z-20 mt-0.5 max-h-44 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] py-1 text-sm shadow-[var(--sh-md)]"
            role="listbox"
          >
            {suggestions.map((lead) => (
              <li key={lead.id} role="option">
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left hover:bg-[var(--vp-surface-low)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(lead)}
                >
                  <span className="block font-medium">{lead.personName}</span>
                  {lead.companyName ? (
                    <span className="block text-xs text-[var(--muted)]">{lead.companyName}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {loading && !selected && query.trim().length >= 2 ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)]">
            …
          </span>
        ) : null}
      </div>
      {selected ? (
        <p className="text-xs text-[var(--muted)]">
          {selected.personName}
          {selected.companyName ? ` · ${selected.companyName}` : null}
        </p>
      ) : null}
    </div>
  );
}
