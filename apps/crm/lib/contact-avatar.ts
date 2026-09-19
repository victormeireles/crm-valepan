export function resolveContactAvatarSrc(input: {
  src?: string | null;
  phone?: string | null;
  failedSources?: ReadonlySet<string>;
  allowRemoteFallback?: boolean;
  allowRefresh?: boolean;
}): string | null {
  const failedSources = input.failedSources ?? new Set<string>();
  const directSrc = input.src?.trim() || null;
  const normalizedPhone = input.phone?.trim() ?? "";
  const proxySrc = /^\+\d{8,15}$/.test(normalizedPhone)
    ? `/api/contacts/avatar?phone=${encodeURIComponent(normalizedPhone)}`
    : null;
  const refreshSrc = proxySrc ? `${proxySrc}&refresh=1` : null;
  const candidates = [
    directSrc,
    input.allowRemoteFallback === false ? null : proxySrc,
    input.allowRemoteFallback === false || input.allowRefresh === false ? null : refreshSrc,
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && !failedSources.has(candidate))) ?? null;
}
