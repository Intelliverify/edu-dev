// Admin bootstrap: verify Supabase + Vercel tokens (read from .env.local at runtime,
// never printed), report orgs/projects/teams, and apply migration 005 via the
// Supabase Management API (which, unlike the service_role key, can run DDL).
//
// Usage:  node scripts/iva-admin.mjs [--run-005]
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, "../.env.local"), "utf-8").split(/\r?\n/)) {
  if (/^\s*#/.test(line)) continue;
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SB = env.SUPABASE_ACCESS_TOKEN;
const VC = env.VERCEL_TOKEN;
const REF = "mmznugcbwbjeqnmmwmxn";
const runMig = process.argv.includes("--run-005");
const mask = (t) => (t ? `${t.slice(0, 6)}…(${t.length} chars)` : "MISSING");

console.log("Supabase token:", mask(SB));
console.log("Vercel   token:", mask(VC));

const sbHead = { Authorization: `Bearer ${SB}` };
const sbJson = { ...sbHead, "Content-Type": "application/json" };
const q = (ref, query) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: sbJson, body: JSON.stringify({ query }),
  });

if (SB) {
  console.log("\n== Supabase ==");
  const o = await fetch("https://api.supabase.com/v1/organizations", { headers: sbHead });
  console.log("GET /organizations ->", o.status);
  let orgs = [];
  try { orgs = await o.json(); } catch {}
  if (Array.isArray(orgs)) orgs.forEach((x) => console.log(`  org: ${x.name}  id=${x.id}  plan=${x.plan ?? "?"}`));
  else console.log("  ", JSON.stringify(orgs).slice(0, 300));

  const p = await fetch("https://api.supabase.com/v1/projects", { headers: sbHead });
  console.log("GET /projects ->", p.status);
  let projs = [];
  try { projs = await p.json(); } catch {}
  if (Array.isArray(projs)) projs.forEach((x) =>
    console.log(`  project: ${x.name}  ref=${x.id}  region=${x.region}  org=${x.organization_id}  status=${x.status}`));
  else console.log("  ", JSON.stringify(projs).slice(0, 300));

}

// --- LIVE account (owns mmznugcbwbjeqnmmwmxn) ---
const SBL = env.SUPABASE_ACCESS_TOKEN_LIVE;
console.log("\nSupabase LIVE token:", mask(SBL));
if (SBL) {
  const hj = { Authorization: `Bearer ${SBL}`, "Content-Type": "application/json" };
  const ql = (ref, query) =>
    fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST", headers: hj, body: JSON.stringify({ query }),
    });
  const p = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${SBL}` } });
  console.log("GET /projects (live) ->", p.status);
  let projs = []; try { projs = await p.json(); } catch {}
  if (Array.isArray(projs)) projs.forEach((x) =>
    console.log(`  project: ${x.name}  ref=${x.id}  region=${x.region}  org=${x.organization_id}  status=${x.status}`));
  else console.log("  ", JSON.stringify(projs).slice(0, 300));

  if (runMig) {
    console.log(`\n== Apply migration 005 to ${REF} (live token) ==`);
    const sql = readFileSync(join(__dirname, "../supabase/migrations/005_add_is_default_password.sql"), "utf-8");
    const r = await ql(REF, sql + "\nNOTIFY pgrst, 'reload schema';");
    console.log("run 005 ->", r.status, (await r.text()).slice(0, 300));
    const v = await ql(REF,
      "select column_name, data_type, is_nullable, column_default from information_schema.columns " +
      "where table_schema='public' and table_name='parent_accounts' and column_name='is_default_password';");
    console.log("verify  ->", v.status, (await v.text()).slice(0, 300));
    const c = await ql(REF,
      "select count(*)::int total, count(*) filter (where is_default_password) on_default from public.parent_accounts;");
    console.log("counts  ->", c.status, (await c.text()).slice(0, 200));
  }
}

// --- DEV/STAGING account ---
const SBD = env.SUPABASE_ACCESS_TOKEN_DEV;
console.log("\nSupabase DEV token:", mask(SBD));
if (SBD) {
  const h = { Authorization: `Bearer ${SBD}` };
  const o = await fetch("https://api.supabase.com/v1/organizations", { headers: h });
  console.log("GET /organizations (dev) ->", o.status);
  let orgs = []; try { orgs = await o.json(); } catch {}
  if (Array.isArray(orgs)) orgs.forEach((x) => console.log(`  org: ${x.name}  id=${x.id}  plan=${x.plan ?? "?"}`));
  else console.log("  ", JSON.stringify(orgs).slice(0, 300));
  const p = await fetch("https://api.supabase.com/v1/projects", { headers: h });
  console.log("GET /projects (dev) ->", p.status);
  let projs = []; try { projs = await p.json(); } catch {}
  if (Array.isArray(projs)) projs.forEach((x) =>
    console.log(`  project: ${x.name}  ref=${x.id}  region=${x.region}  org=${x.organization_id}  status=${x.status}`));
  else console.log("  ", JSON.stringify(projs).slice(0, 300));
}

if (VC) {
  console.log("\n== Vercel ==");
  const u = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${VC}` } });
  const uu = await u.json().catch(() => ({}));
  console.log("GET /v2/user ->", u.status, " user:", uu?.user?.username || uu?.username || "?");
  const t = await fetch("https://api.vercel.com/v2/teams", { headers: { Authorization: `Bearer ${VC}` } });
  const tt = await t.json().catch(() => ({}));
  console.log("GET /v2/teams ->", t.status);
  (tt?.teams || []).forEach((x) => console.log(`  team: ${x.slug}  id=${x.id}`));
  const vcGet = async (path) => {
    const r = await fetch(`https://api.vercel.com${path}`, { headers: { Authorization: `Bearer ${VC}` } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const teamId = tt?.teams?.[0]?.id;
  for (const scope of [null, teamId].filter((v, i, a) => a.indexOf(v) === i)) {
    const qs = scope ? `?teamId=${scope}&limit=100` : `?limit=100`;
    const r = await vcGet(`/v9/projects${qs}`);
    console.log(`projects (${scope || "personal"}) -> ${r.status}`);
    (r.body?.projects || []).forEach((p) => console.log(`  ${p.name}  id=${p.id}`));
  }
  const edu = await vcGet(`/v9/projects/prj_q532S7EaZj7XNSBk6jTnDnpH2DlW`);
  console.log("edu project (prj_q532…) direct ->", edu.status, edu.body?.name || edu.body?.error?.message || "");
  for (const id of ["prj_q532S7EaZj7XNSBk6jTnDnpH2DlW", "prj_vt1nE5ZMKzLiCI5mTarcd0r3GJAy"]) {
    const d = await vcGet(`/v9/projects/${id}/domains?limit=100`);
    console.log(`domains for ${id} -> ${d.status}`);
    (d.body?.domains || []).forEach((x) => console.log(`  ${x.name}${x.verified ? "" : " (unverified)"}`));
  }
}
console.log("\nDone.");
