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
}: {
  name: string;
  src?: string | null;
  phone?: string | null;
  className: string;
  textClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const normalizedPhone = phone?.trim() ?? "";
  const directSrc = src?.trim() ?? null;
  const proxySrc = /^\+\d{8,15}$/.test(normalizedPhone)
    ? `/api/contacts/avatar?phone=${encodeURIComponent(normalizedPhone)}`
    : null;
  const primarySrc = proxySrc ?? directSrc;
  const normalizedSrc =
    proxySrc && directSrc && failedSrc === proxySrc
      ? `${proxySrc}&refresh=1`
      : primarySrc;

  if (normalizedSrc && failedSrc !== normalizedSrc) {
    return (
      // A rota interna renova links temporários da Z-API; as iniciais cobrem contatos sem foto.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={normalizedSrc}
        alt={`Foto de ${name}`}
        className={`${className} rounded-full object-cover`}
        onError={() => setFailedSrc(normalizedSrc)}
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
