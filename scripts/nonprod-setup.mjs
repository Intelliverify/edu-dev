// Inspect client-prod (mmzn) + edu-nonprod table inventories and pull edu-nonprod's
// API keys into .env.nonprod.local (gitignored). Non-secret output only.
import { readFileSync, appendFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "../.env.local"), "utf-8").split(/\r?\n/)) {
  if (/^\s*#/.test(line)) continue;
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const DEV = env.SUPABASE_ACCESS_TOKEN_DEV;
const LIVE = env.SUPABASE_ACCESS_TOKEN_LIVE;
const NONPROD = "rfirqivzuvuljgqirrof";
const LIVEREF = "mmznugcbwbjeqnmmwmxn";
const OUT = join(__dirname, "../.env.nonprod.local");

const q = (tok, ref, query) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
const tablesSQL =
  "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name;";

let r = await q(LIVE, LIVEREF, tablesSQL);
let j = await r.json().catch(() => ({}));
console.log("client-prod (mmzn) public tables ->", r.status);
console.log("  ", Array.isArray(j) ? j.map((x) => x.table_name).join(", ") : JSON.stringify(j).slice(0, 300));

r = await q(DEV, NONPROD, tablesSQL);
j = await r.json().catch(() => ({}));
console.log("edu-nonprod public tables ->", r.status);
console.log("  ", Array.isArray(j) ? (j.length ? j.map((x) => x.table_name).join(", ") : "(empty)") : JSON.stringify(j).slice(0, 300));

const kr = await fetch(`https://api.supabase.com/v1/projects/${NONPROD}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${DEV}` },
});
const keys = await kr.json().catch(() => []);
console.log("edu-nonprod api-keys ->", kr.status, Array.isArray(keys) ? "[" + keys.map((k) => k.name).join(", ") + "]" : "");
if (Array.isArray(keys)) {
  const anon = keys.find((k) => k.name === "anon")?.api_key;
  const service = keys.find((k) => k.name === "service_role")?.api_key;
  appendFileSync(OUT, `\n# edu-nonprod keys (auto) ${new Date().toISOString()}\nNONPROD_SUPABASE_URL=https://${NONPROD}.supabase.co\n`);
  if (anon) appendFileSync(OUT, `NONPROD_SUPABASE_ANON_KEY=${anon}\n`);
  if (service) appendFileSync(OUT, `NONPROD_SUPABASE_SERVICE_ROLE_KEY=${service}\n`);
  console.log("✅ wrote URL + anon + service_role to .env.nonprod.local (gitignored)");
}
console.log("Done.");
