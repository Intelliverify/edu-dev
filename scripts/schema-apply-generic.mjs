// Apply a SQL file to a target project via the Management API (atomic).
// Usage: node scripts/schema-apply-generic.mjs <dstRef> <TOKEN_ENV_NAME> <file>
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const l of readFileSync(join(__dirname, "../.env.local"), "utf-8").split(/\r?\n/)) {
  if (/^\s*#/.test(l)) continue;
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const [dstRef, tokenName, file] = process.argv.slice(2);
if (!dstRef || !tokenName || !file) { console.error("Usage: node schema-apply-generic.mjs <dstRef> <TOKEN_ENV_NAME> <file>"); process.exit(1); }
const T = env[tokenName];
if (!T) { console.error("token env missing:", tokenName); process.exit(1); }
const run = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${dstRef}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, text: await r.text() };
};
const sql = readFileSync(join(__dirname, "..", file), "utf-8");
console.log(`Applying ${file} (${sql.length} bytes) -> ${dstRef}…`);
const res = await run(sql);
console.log("apply ->", res.status);
if (res.status >= 400) { console.log(res.text.slice(0, 800)); process.exit(1); }
const count = async (label, q) => { const r = await run(q); console.log(`${label}:`, r.text.slice(0, 120)); };
await count("tables", "select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
await count("functions", "select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
await count("policies", "select count(*)::int c from pg_policies where schemaname='public'");
await count("fks", "select count(*)::int c from information_schema.table_constraints where table_schema='public' and constraint_type='FOREIGN KEY'");
console.log("Done.");
