// READ-ONLY: scope the public schema of client-prod (mmzn) via Management API.
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
const T = env.SUPABASE_ACCESS_TOKEN_LIVE;
const REF = "mmznugcbwbjeqnmmwmxn";
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, rows: await r.json().catch(() => []) };
};
const show = async (label, sql) => {
  const { status, rows } = await q(sql);
  const list = Array.isArray(rows) ? rows.map((r) => Object.values(r).join(" | ")).join("\n") : JSON.stringify(rows).slice(0, 300);
  console.log(`\n== ${label} (${status}) ==\n${list}`);
};
await show("views", "select table_name from information_schema.views where table_schema='public' order by 1");
await show("enum types", "select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e' order by 1");
await show("sequences (count)", "select count(*) from information_schema.sequences where sequence_schema='public'");
await show("functions", "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1");
await show("triggers (count)", "select count(*) from information_schema.triggers where trigger_schema='public'");
await show("rls policies per table", "select (schemaname||'.'||tablename) tbl, count(*) n from pg_policies where schemaname='public' group by 1 order by 1");
await show("extensions", "select extname from pg_extension order by 1");
await show("indexes (count)", "select count(*)::text from pg_indexes where schemaname='public'");
await show("FK constraints (count)", "select count(*)::text from information_schema.table_constraints where table_schema='public' and constraint_type='FOREIGN KEY'");
console.log("\nDone.");
