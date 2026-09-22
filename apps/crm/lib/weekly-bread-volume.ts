export type VolumeLine = {
  amount: number;
  unit: "paes" | "caixas";
  period: "dia" | "semana" | "mes";
};

export function weeklyBreadCount(lines: VolumeLine[]): number | null {
  const weekly = lines
    .filter((line) => Number.isFinite(line.amount) && line.amount > 0)
    .map((line) => {
      const breads = line.unit === "caixas" ? line.amount * 48 : line.amount;
      if (line.period === "dia") return breads * 7;
      if (line.period === "mes") return Math.round(breads * 7 / 30);
      return breads;
    });
  if (weekly.length === 0) return null;
  return Math.round(weekly.reduce((sum, value) => sum + value, 0));
}
