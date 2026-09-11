"use client";

import { useState } from "react";

function firstInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

export function ContactAvatar({
  name,
  src,
  phone,
  className,
  textClassName,
  loading = "lazy",
}: {
  name: string;
  src?: string | null;
  phone?: string | null;
  className: string;
  textClassName?: string;
  loading?: "eager" | "lazy";
}) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const normalizedPhone = phone?.trim() ?? "";
  const directSrc = src?.trim() || null;
  const proxySrc = /^\+\d{8,15}$/.test(normalizedPhone)
    ? `/api/contacts/avatar?phone=${encodeURIComponent(normalizedPhone)}`
    : null;
  const refreshSrc = proxySrc ? `${proxySrc}&refresh=1` : null;
  const normalizedSrc = [directSrc, proxySrc, refreshSrc].find(
    (candidate): candidate is string => Boolean(candidate && !failedSources.has(candidate)),
  ) ?? null;

  if (normalizedSrc) {
    return (
      // Usa primeiro a URL já carregada com a lista. O endpoint interno só entra
      // como fallback e renova links temporários quando ambos falham.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={normalizedSrc}
        alt={`Foto de ${name}`}
        className={`${className} rounded-full object-cover`}
        loading={loading}
        decoding="async"
        onError={() => setFailedSources((previous) => {
          const next = new Set(previous);
          next.add(normalizedSrc);
          return next;
        })}
      />
    );
  }

  return (
    <span
      className={`grid ${className} place-items-center rounded-full border border-[#c7edc5] bg-[#dcf8d8] font-semibold text-[#16845b] ${textClassName ?? "text-sm"}`}
      aria-label={`Avatar de ${name}`}
      title={name}
    >
      {firstInitial(name)}
    </span>
  );
}
