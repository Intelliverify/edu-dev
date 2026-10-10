// Apply supabase/_schema_dump.sql to edu-nonprod (rfirqivzuvuljgqirrof) via the
// Management API (DEV token). DDL only — no secrets, no data. Verifies counts after.
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
const DEV = env.SUPABASE_ACCESS_TOKEN_DEV;
const REF = "rfirqivzuvuljgqirrof";
const run = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${DEV}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, text: await r.text() };
};

const sql = readFileSync(join(__dirname, "../supabase/_schema_dump.sql"), "utf-8");
console.log(`Applying ${sql.length} bytes to edu-nonprod…`);
const res = await run(sql);
console.log("apply ->", res.status);
console.log(res.text.slice(0, 600));

const count = async (label, q) => { const r = await run(q); console.log(`${label}:`, r.text.slice(0, 120)); };
await count("tables", "select count(*)::int c from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
await count("functions", "select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
await count("policies", "select count(*)::int c from pg_policies where schemaname='public'");
await count("fks", "select count(*)::int c from information_schema.table_constraints where table_schema='public' and constraint_type='FOREIGN KEY'");
await count("parent_accounts has is_default_password",
  "select count(*)::int c from information_schema.columns where table_schema='public' and table_name='parent_accounts' and column_name='is_default_password'");
console.log("Done.");
