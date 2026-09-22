"use client";

import { CrmIcon } from "@/components/crm-icon";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type CrmMenuOption = { value: string; label: string; meta?: string };

type Variant = "toolbar" | "row" | "field";

type MenuCoords = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  side: "up" | "down";
};

function foldSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

export function CrmMenuSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  variant = "field",
  labelledBy,
  align = variant === "field" ? "start" : "end",
  searchable = false,
  portalRoot = null,
  wide = false,
}: {
  label?: string;
  value: string;
  options: CrmMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: Variant;
  labelledBy?: string;
  align?: "start" | "end";
  searchable?: boolean;
  /** Mantém o menu dentro de um dialog modal. O top layer do dialog esconde portais no body. */
  portalRoot?: HTMLElement | null;
  wide?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const listId = `${reactId}-lista`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeBuffer = useRef("");
  const typeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const foldedQuery = foldSearch(query.trim());
  const visibleOptions =
    searchable && foldedQuery
      ? options.filter((option) => option.value !== "" && foldSearch(option.label).includes(foldedQuery))
      : options;

  const selected = options.find((option) => option.value === value) ?? null;
  const display = selected?.label ?? "Selecionar";
  const muted = value === "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function update(event?: Event) {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      const pad = 8;
      const gap = 6;
      const width =
        variant === "toolbar"
          ? Math.min(320, Math.max(rect.width, 220))
          : rect.width;
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const preferUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(320, preferUp ? spaceAbove : spaceBelow));
      setCoords(
        preferUp
          ? { bottom: window.innerHeight - rect.top + gap, left, width, maxHeight, side: "up" }
          : { top: rect.bottom + gap, left, width, maxHeight, side: "down" },
      );
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, variant, options.length]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !coords) return;
    if (searchable) searchRef.current?.focus();
    else menuRef.current?.focus();
  }, [open, coords, searchable]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) buttonRef.current?.focus();
  }

  function openMenu() {
    if (disabled || options.length === 0) return;
    const index = options.findIndex((option) => option.value === value);
    setQuery("");
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }

  function choose(next: string) {
    close(true);
    if (next !== value) onChange(next);
  }

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const fromSearch = event.target instanceof HTMLInputElement;
    const last = Math.max(0, visibleOptions.length - 1);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(last, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(last);
    } else if (event.key === "Enter" || (event.key === " " && !fromSearch)) {
      event.preventDefault();
      const option = visibleOptions[active];
      if (option) choose(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (fromSearch && query) {
        setQuery("");
        setActive(0);
        return;
      }
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (!fromSearch && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      typeBuffer.current += event.key.toLocaleLowerCase("pt-BR");
      const match = visibleOptions.findIndex((option) =>
        option.label.toLocaleLowerCase("pt-BR").startsWith(typeBuffer.current),
      );
      if (match >= 0) setActive(match);
      if (typeTimer.current) window.clearTimeout(typeTimer.current);
      typeTimer.current = window.setTimeout(() => {
        typeBuffer.current = "";
      }, 500);
    }
  }

  const chevron = (
    <CrmIcon
      name="expand_more"
      className={`shrink-0 text-base text-[var(--vp-gold-deep)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    />
  );

  const valueClass = muted
    ? "truncate font-semibold text-[var(--vp-ink-muted)]"
    : "truncate font-bold text-[var(--vp-wine)]";

  const toolbarWidth = wide ? "min-w-[8.5rem] max-w-[18rem]" : "max-w-[11.5rem] min-w-[8.25rem]";
  const buttonClass =
    variant === "toolbar"
      ? `inline-flex min-h-11 ${toolbarWidth} items-center gap-2 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 py-1.5 text-left shadow-[0_1px_0_rgba(35,0,4,0.04)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--vp-gold-classic)] hover:bg-[var(--vp-gold-cream)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--vp-ink-line)] disabled:hover:bg-[var(--vp-paper-pure)] data-[open=true]:border-[var(--vp-gold-classic)] data-[open=true]:bg-[var(--vp-gold-cream)] data-[open=true]:shadow-[var(--sh-sm)]`
      : variant === "row"
        ? "flex min-h-11 w-full items-center justify-between gap-2.5 rounded-[10px] border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-3 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--vp-gold-classic)] hover:bg-[var(--vp-paper-pure)] hover:shadow-[var(--sh-sm)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--vp-ink-line)] disabled:hover:bg-[var(--vp-paper)] disabled:hover:shadow-none data-[open=true]:border-[var(--vp-gold-classic)] data-[open=true]:bg-[var(--vp-paper-pure)] data-[open=true]:shadow-[var(--sh-sm)]"
        : "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] px-3 text-left transition-[border-color,background-color] duration-200 hover:border-[var(--vp-gold-classic)] hover:bg-[var(--vp-gold-cream)] disabled:cursor-not-allowed disabled:opacity-50 data-[open=true]:border-[var(--vp-gold-classic)] data-[open=true]:bg-[var(--vp-gold-cream)]";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${buttonClass} cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vp-gold-classic)] focus-visible:ring-offset-2`}
        disabled={disabled}
        data-open={open ? "true" : "false"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
      >
        {variant === "toolbar" ? (
          <span className="flex min-w-0 flex-1 flex-col items-start">
            {label ? (
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--vp-ink-muted)]">
                {label}
              </span>
            ) : null}
            <span className={`max-w-full text-[13px] leading-tight ${valueClass}`} title={display}>
              {display}
            </span>
          </span>
        ) : variant === "row" ? (
          <>
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--vp-ink-soft)]">
              {label}
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
              <span className={`min-w-0 text-[13px] leading-tight ${valueClass}`} title={display}>
                {display}
              </span>
              {chevron}
            </span>
          </>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`min-w-0 flex-1 text-[13px] leading-tight ${valueClass}`} title={display}>
              {display}
            </span>
            {selected?.meta ? (
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-[var(--vp-ink-body)]">
                {selected.meta}
              </span>
            ) : null}
          </span>
        )}
        {variant === "row" ? null : chevron}
      </button>
      {mounted && open && coords
        ? createPortal(
            <div
              ref={menuRef}
              tabIndex={-1}
              aria-activedescendant={!searchable && visibleOptions[active] ? `${reactId}-opcao-${active}` : undefined}
              className={`fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-[var(--vp-ink-line)] bg-[var(--vp-paper-pure)] shadow-[0_16px_40px_rgba(35,0,4,0.16)] outline-none ${coords.side === "up" ? "animate-[crm-menu-in-up_160ms_var(--ease-out-quint)]" : "animate-[crm-menu-in_160ms_var(--ease-out-quint)]"}`}
              style={{ top: coords.top, bottom: coords.bottom, left: coords.left, width: coords.width, maxHeight: coords.maxHeight }}
              onKeyDown={onMenuKeyDown}
            >
              {label ? (
                <div className="shrink-0 border-b border-[var(--vp-ink-line)] px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--vp-gold-deep)]">
                    {label}
                  </p>
                </div>
              ) : null}
              {searchable ? (
                <div className="shrink-0 border-b border-[var(--vp-ink-line)] px-2 py-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--vp-ink-line)] bg-[var(--vp-paper)] px-2.5 focus-within:border-[var(--vp-gold-classic)]">
                    <CrmIcon name="search" className="shrink-0 text-base text-[var(--vp-gold-deep)]" />
                    <input
                      ref={searchRef}
                      value={query}
                      role="searchbox"
                      aria-label={label ? `Buscar ${label.toLocaleLowerCase("pt-BR")}` : "Buscar"}
                      aria-controls={listId}
                      aria-activedescendant={visibleOptions[active] ? `${reactId}-opcao-${active}` : undefined}
                      placeholder={label ? `Buscar ${label.toLocaleLowerCase("pt-BR")}` : "Buscar"}
                      className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--vp-ink-body)] outline-none placeholder:text-[var(--vp-ink-muted)]"
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setActive(0);
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <div
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label={label}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
              >
                {visibleOptions.length === 0 ? (
                  <p className="px-2.5 py-3 text-[13px] text-[var(--vp-ink-muted)]">Nenhum resultado</p>
                ) : null}
                {visibleOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === active;
                  return (
                    <button
                      key={`${option.value}-${index}`}
                      id={`${reactId}-opcao-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-index={index}
                      data-active={isActive ? "true" : "false"}
                      title={option.label}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150 ${
                        isSelected
                          ? `bg-[var(--vp-wine)] font-bold text-[var(--vp-gold)] ${isActive ? "ring-2 ring-inset ring-[var(--vp-gold)]" : ""}`
                          : isActive
                            ? "bg-[var(--vp-gold-cream)] font-semibold text-[var(--vp-ink-body)]"
                            : option.value === ""
                              ? "font-medium text-[var(--vp-ink-muted)] hover:bg-[var(--vp-surface)]"
                              : "font-semibold text-[var(--vp-ink-body)] hover:bg-[var(--vp-surface)]"
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.meta ? (
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            isSelected ? "text-[var(--vp-gold)]" : "text-[var(--vp-ink-body)]"
                          }`}
                        >
                          {option.meta}
                        </span>
                      ) : null}
                      {isSelected ? <CrmIcon name="check" className="shrink-0 text-base" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            portalRoot ?? document.body,
          )
        : null}
    </>
  );
}
