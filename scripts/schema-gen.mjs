// READ-ONLY on client-prod (mmzn): generate an ordered public-schema DDL dump
// using Postgres' pg_get_*def builtins. Writes supabase/_schema_dump.sql for review.
// Does NOT apply anything. Run: node scripts/schema-gen.mjs
import { readFileSync, writeFileSync } from "fs";
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
const col = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const rows = await r.json().catch(() => []);
  if (!r.ok) { console.error("query failed", r.status, JSON.stringify(rows).slice(0, 300)); process.exit(1); }
  return rows.map((x) => Object.values(x)[0]).filter(Boolean);
};

const parts = [];
const add = (title, arr, sep = "\n") => { parts.push(`\n-- ========== ${title} (${arr.length}) ==========`); if (arr.length) parts.push(arr.join(sep)); };

// 1. extensions (skip plpgsql which is always present)
add("EXTENSIONS", await col(
  "select 'create extension if not exists \"'||extname||'\" with schema extensions;' from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname not in ('plpgsql') order by extname"
));
// 2. sequences
add("SEQUENCES", await col(
  "select 'create sequence if not exists public.'||quote_ident(sequence_name)||';' from information_schema.sequences where sequence_schema='public' order by sequence_name"
));
// 2b. functions BEFORE tables (table defaults/checks may reference them; bodies unchecked)
add("FUNCTIONS", await col(
  "select pg_get_functiondef(p.oid)||';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname"
), "\n\n");
// 3. tables (columns + defaults + not null + identity)
add("TABLES", await col(`
  select 'create table if not exists public.'||quote_ident(c.relname)||' ('||chr(10)||
    string_agg('  '||quote_ident(a.attname)||' '||format_type(a.atttypid,a.atttypmod)||
      case when a.attgenerated = 's' then ' generated always as ('||pg_get_expr(ad.adbin, ad.adrelid)||') stored'
           when a.attidentity in ('a','d') then ' generated '||(case a.attidentity when 'a' then 'always' else 'by default' end)||' as identity'
           when ad.adbin is not null then ' default '||pg_get_expr(ad.adbin, ad.adrelid) else '' end||
      case when a.attnotnull then ' not null' else '' end, ','||chr(10) order by a.attnum)||
    chr(10)||');'
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid=c.oid and ad.adnum=a.attnum
  where c.relkind='r' group by c.relname order by c.relname`, ), "\n\n");
// 4. PK / UNIQUE / CHECK constraints
add("CONSTRAINTS (pk/unique/check)", await col(`
  select 'alter table public.'||quote_ident(rel.relname)||' add constraint '||quote_ident(con.conname)||' '||pg_get_constraintdef(con.oid)||';'
  from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace n on n.oid=rel.relnamespace
  where n.nspname='public' and con.contype in ('p','u','c') order by con.contype desc, rel.relname`));
// 5. FOREIGN KEYS (after all tables)
add("FOREIGN KEYS", await col(`
  select 'alter table public.'||quote_ident(rel.relname)||' add constraint '||quote_ident(con.conname)||' '||pg_get_constraintdef(con.oid)||';'
  from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace n on n.oid=rel.relnamespace
  where n.nspname='public' and con.contype='f' order by rel.relname`));
// 6. indexes (exclude those backing constraints)
add("INDEXES", await col(`
  select pg_get_indexdef(i.indexrelid)||';'
  from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_namespace n on n.oid=ic.relnamespace
  where n.nspname='public' and not exists (select 1 from pg_constraint co where co.conindid=i.indexrelid) order by ic.relname`));
// 8. triggers
add("TRIGGERS", await col(
  "select pg_get_triggerdef(t.oid)||';' from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname"
));
// 9. enable RLS
add("ENABLE RLS", await col(
  "select 'alter table public.'||quote_ident(tablename)||' enable row level security;' from pg_tables where schemaname='public' and rowsecurity order by tablename"
));
// 10. policies
add("POLICIES", await col(`
  select 'create policy '||quote_ident(policyname)||' on public.'||quote_ident(tablename)||
    ' as '||permissive||' for '||cmd||' to '||array_to_string(roles,', ')||
    coalesce(' using ('||qual||')','')||coalesce(' with check ('||with_check||')','')||';'
  from pg_policies where schemaname='public' order by tablename, policyname`));

const out = "-- Auto-generated schema dump of client-prod (mmzn) public schema\n-- Generated " + new Date().toISOString() + "\nset check_function_bodies = off;\n" + parts.join("\n") + "\n";
const file = join(__dirname, "../supabase/_schema_dump.sql");
writeFileSync(file, out, "utf-8");
console.log("Wrote", file);
console.log("Size:", out.length, "bytes,", out.split("\n").length, "lines");
for (const p of parts) if (p.startsWith("\n-- ====")) console.log("  " + p.trim().replace(/-- =+ | =+/g, ""));
