import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const f of ["../.env.local", "../.env.nonprod.local"]) {
  try { for (const l of readFileSync(join(__dirname, f), "utf-8").split(/\r?\n/)) {
    if (/^\s*#/.test(l)) continue;
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  } } catch {}
}
const VT = env.VERCEL_TOKEN, TEAM = "team_vaW4BU9CDGjRdliIEYfeEzQx";
const EDU = "prj_q532S7EaZj7XNSBk6jTnDnpH2DlW", EDUDEV = "prj_xMLOybSdKPVmN6WM9jRZVYoPs0gX";
const ND_URL = env.NONPROD_SUPABASE_URL, ND_ANON = env.NONPROD_SUPABASE_ANON_KEY, ND_SRV = env.NONPROD_SUPABASE_SERVICE_ROLE_KEY;
if (!VT || !ND_URL || !ND_ANON || !ND_SRV) { console.error("missing VERCEL_TOKEN or NONPROD_* keys"); process.exit(1); }
const v = async (m, p, b) => {
  const sep = p.includes("?") ? "&" : "?";
  const r = await fetch("https://api.vercel.com" + p + sep + "teamId=" + TEAM, { method: m, headers: { Authorization: "Bearer " + VT, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { ok: r.ok, status: r.status, j };
};
const overrides = {
  NEXT_PUBLIC_SUPABASE_URL: ND_URL, SUPABASE_URL: ND_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ND_ANON, SUPABASE_ANON_KEY: ND_ANON,
  SUPABASE_SERVICE_ROLE_KEY: ND_SRV,
  NEXT_PUBLIC_SITE_URL: "https://dev.edu.intelliverify.in",
  NEXT_PUBLIC_APP_URL: "https://dev.edu.intelliverify.in",
  VERCEL_PROJECT_ID: EDUDEV,
};
const er = await fetch("https://api.vercel.com/v9/projects/" + EDU + "/env?decrypt=true&teamId=" + TEAM, { headers: { Authorization: "Bearer " + VT } });
const envs = (await er.json()).envs || [];
console.log("cloning " + envs.length + " env vars into edu-dev…");
for (const e of envs) {
  const value = overrides[e.key] !== undefined ? overrides[e.key] : e.value;
  const up = await v("POST", "/v10/projects/" + EDUDEV + "/env?upsert=true", { key: e.key, value, type: e.type, target: e.target, ...(e.gitBranch ? { gitBranch: e.gitBranch } : {}) });
  console.log("  " + e.key + ": " + up.status + (overrides[e.key] !== undefined ? " [override]" : ""));
}
const pr = await v("GET", "/v9/projects/" + EDUDEV);
const repoId = pr.j && pr.j.link && pr.j.link.repoId;
const d = await v("POST", "/v13/deployments", { name: "edu-dev", project: EDUDEV, target: "production", gitSource: { type: "github", ref: "develop", repoId } });
console.log("edu-dev redeploy:", d.status, d.ok ? (d.j.url + " | " + (d.j.readyState || d.j.status)) : JSON.stringify(d.j).slice(0, 200));
