export function isPhoneSearchQuery(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 4 && trimmed.replace(/[\d\s()+.\-/]/g, "") === "";
}
