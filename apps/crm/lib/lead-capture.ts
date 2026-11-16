export function formatCaptureZip(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function formatLeadSource(source: string): string {
  const key = source.trim().toLowerCase();
  return (
    {
      whatsapp: "WhatsApp",
      manual: "Manual",
      ifood_event: "Evento iFood",
    }[key] ?? source
  );
}
