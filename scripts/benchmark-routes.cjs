const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createServerClient } = require("@supabase/ssr");

const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt < 1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.local"));

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;
const baseUrl = process.argv[2] ?? "http://localhost:3102";
const sampleCount = Number.parseInt(process.argv[3] ?? "5", 10);

if (!supabaseUrl || !supabaseAnon || !adminPassword) {
  throw new Error("Faltam SUPABASE_URL, SUPABASE_ANON_KEY ou ADMIN_PASSWORD.");
}

const cookieJar = new Map();
const supabase = createServerClient(supabaseUrl, supabaseAnon, {
  cookies: {
    getAll() {
      return [...cookieJar].map(([name, value]) => ({ name, value }));
    },
    setAll(cookies) {
      for (const cookie of cookies) {
        if (cookie.value) cookieJar.set(cookie.name, cookie.value);
        else cookieJar.delete(cookie.name);
      }
    },
  },
});

function cookieHeader() {
  return [...cookieJar]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function measure(route) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  const firstByteAt = performance.now();
  const body = await response.arrayBuffer();
  const finishedAt = performance.now();
  if (response.status !== 200) {
    throw new Error(`${route}: HTTP ${response.status}`);
  }
  return {
    ttfbMs: firstByteAt - startedAt,
    totalMs: finishedAt - startedAt,
    bytes: body.byteLength,
  };
}

async function discoverConversationRoute() {
  const response = await fetch(`${baseUrl}/inbox`, {
    headers: { cookie: cookieHeader() },
  });
  const html = await response.text();
  const match = html.match(/\/inbox\?tab=leads(?:&amp;|&)cid=([^"&]+)/);
  return match ? `/inbox?tab=leads&cid=${match[1]}` : null;
}

async function main() {
  const { error } = await supabase.auth.signInWithPassword({
    email: "admin@login.crm.valepan",
    password: adminPassword,
  });
  if (error) throw error;

  const routes = [
    "/dashboard",
    "/inbox",
    "/leads",
    "/pipeline",
    "/tasks",
    "/samples",
    "/distributors",
  ];
  const conversationRoute = await discoverConversationRoute();
  if (conversationRoute) routes.splice(2, 0, conversationRoute);

  const results = [];
  for (const route of routes) {
    await measure(route);
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await measure(route));
    }
    results.push({
      route,
      samples: sampleCount,
      medianTtfbMs: Number(median(samples.map((item) => item.ttfbMs)).toFixed(1)),
      medianTotalMs: Number(median(samples.map((item) => item.totalMs)).toFixed(1)),
      minTotalMs: Number(Math.min(...samples.map((item) => item.totalMs)).toFixed(1)),
      maxTotalMs: Number(Math.max(...samples.map((item) => item.totalMs)).toFixed(1)),
      bytes: samples[0].bytes,
    });
  }

  console.table(results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
