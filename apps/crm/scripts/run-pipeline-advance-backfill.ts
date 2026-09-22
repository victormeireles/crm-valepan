import { readFileSync } from "node:fs";
import path from "node:path";
import { runPipelineAdvanceBackfill } from "../lib/pipeline-advance-job";

function loadEnv(file: string) {
  const contents = readFileSync(file, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));
loadEnv(path.join(process.cwd(), "apps/crm/.env.local"));

async function main() {
  const rounds = await runPipelineAdvanceBackfill(25, 80);
  const totals = rounds.reduce(
    (acc, round) => ({
      scanned: acc.scanned + round.scanned,
      suggested: acc.suggested + round.suggested,
      autoApplied: acc.autoApplied + round.autoApplied,
      skipped: acc.skipped + round.skipped,
      errors: acc.errors + round.errors,
    }),
    { scanned: 0, suggested: 0, autoApplied: 0, skipped: 0, errors: 0 },
  );
  console.log("[pipeline-advance] backfill totals", totals);
}

void main().catch((error) => {
  console.error("[pipeline-advance] backfill failed", error);
  process.exit(1);
});
