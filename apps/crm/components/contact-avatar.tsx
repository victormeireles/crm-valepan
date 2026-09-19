"use client";

import { useState } from "react";
import { resolveContactAvatarSrc } from "@/lib/contact-avatar";

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
  allowRemoteFallback = true,
  allowRefresh = false,
}: {
  name: string;
  src?: string | null;
  phone?: string | null;
  className: string;
  textClassName?: string;
  loading?: "eager" | "lazy";
  allowRemoteFallback?: boolean;
  allowRefresh?: boolean;
}) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const normalizedSrc = resolveContactAvatarSrc({
    src,
    phone,
    failedSources,
    allowRemoteFallback,
    allowRefresh,
  });

  if (normalizedSrc) {
    return (
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
