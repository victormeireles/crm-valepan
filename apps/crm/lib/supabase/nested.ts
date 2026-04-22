/** PostgREST pode devolver objeto ou array em relações 1:N ambíguas. */
export function nestOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
