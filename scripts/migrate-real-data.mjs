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
const [DST, DST_ENV] = process.argv.slice(2);
if (!DST || !DST_ENV) { console.error("Usage: node scripts/migrate-real-data.mjs <destRef> <DEST_TOKEN_ENV>"); process.exit(1); }
const SRC = "mmznugcbwbjeqnmmwmxn", SRC_T = env.SUPABASE_ACCESS_TOKEN_LIVE, DST_T = env[DST_ENV];
if (!SRC_T || !DST_T) { console.error("missing SUPABASE_ACCESS_TOKEN_LIVE or " + DST_ENV); process.exit(1); }
const run = async (ref, token, sql) => {
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
const TABLES = ["programmes","programme_items","sections","school_settings","staff","homework","enquiries","parent_accounts","homework_status","community_channels","channel_members","community_messages","attendance"];
const inserts = [];
for (const t of TABLES) {
  const res = await run(SRC, SRC_T, "select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) j from public." + t + " x");
  const rows = res.j && res.j[0] && res.j[0].j;
  if (!Array.isArray(rows)) { console.error("fetch " + t + " failed", res.status, JSON.stringify(res.j).slice(0, 150)); process.exit(1); }
  console.log("  " + t + ": " + rows.length);
  if (rows.length) inserts.push("insert into public." + t + " select * from jsonb_populate_recordset(null::public." + t + ", $seed$" + JSON.stringify(rows) + "$seed$::jsonb);");
}
const trunc = "truncate table " + TABLES.map(t => "public." + t).join(", ") + " restart identity cascade;";
const sql = "set session_replication_role = replica;\n" + trunc + "\n" + inserts.join("\n") + "\nset session_replication_role = origin;";
console.log("applying (" + sql.length + " bytes) to " + DST + " …");
const ap = await run(DST, DST_T, sql);
console.log("apply ->", ap.status);
if (ap.status >= 400) { console.log(JSON.stringify(ap.j).slice(0, 600)); process.exit(1); }
for (const t of ["parent_accounts","enquiries","staff","sections","programmes"]) { const c = await run(DST, DST_T, "select count(*)::int c from public." + t); console.log("  " + t + ":", JSON.stringify(c.j).slice(0, 40)); }
console.log("Done — RAW original data mirrored to " + DST);
