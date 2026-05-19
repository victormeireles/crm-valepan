"use client";

import { searchCompanyCities } from "@/app/actions/companies";
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** UF opcional para priorizar cidades do mesmo estado. */
  stateFilter?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function CityAutocompleteInput({
  value,
  onChange,
  stateFilter,
  className,
  placeholder,
  disabled,
}: Props) {
  const listId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchCompanyCities({ q, state: stateFilter?.trim() || null }).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (res.ok) {
          setSuggestions(res.cities);
          setOpen(res.cities.length > 0);
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
  }, [value, stateFilter]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  function pick(city: string) {
    onChange(city);
    setOpen(false);
    setSuggestions([]);
  }

  const showList = open && suggestions.length > 0 && !disabled;

  return (
    <div ref={rootRef} className="relative">
      <input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={showList}
      />
      <datalist id={listId}>
        {suggestions.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      {showList ? (
        <ul
          className="absolute z-20 mt-0.5 max-h-44 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--vp-paper-pure)] py-1 text-sm shadow-[var(--sh-md)]"
          role="listbox"
        >
          {suggestions.map((city) => (
            <li key={city} role="option">
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left hover:bg-[var(--vp-surface-low)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(city)}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading && value.trim().length >= 2 ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted)]">
          …
        </span>
      ) : null}
    </div>
  );
}
