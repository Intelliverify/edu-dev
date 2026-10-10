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
const VT = env.VERCEL_TOKEN;
const INTEL = env.SUPABASE_ACCESS_TOKEN;
const TEAM = "team_vaW4BU9CDGjRdliIEYfeEzQx";
const EDU = "prj_q532S7EaZj7XNSBk6jTnDnpH2DlW";
const REPO = "Intelliverify/edu";
const RCXCX = "rcxcxtxwokhlypgsmbfw";
const RCXCX_URL = "https://" + RCXCX + ".supabase.co";
if (!VT || !INTEL) { console.error("missing VERCEL_TOKEN or SUPABASE_ACCESS_TOKEN"); process.exit(1); }
const v = async (method, path, body) => {
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch("https://api.vercel.com" + path + sep + "teamId=" + TEAM, {
    method, headers: { Authorization: "Bearer " + VT, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { ok: r.ok, status: r.status, j };
};
const keyRes = await fetch("https://api.supabase.com/v1/projects/" + RCXCX + "/api-keys?reveal=true", { headers: { Authorization: "Bearer " + INTEL } });
const keys = await keyRes.json();
const pick = (n) => (Array.isArray(keys) ? (keys.find((k) => k.name === n) || {}).api_key : (keys || {})[n]);
const RC_ANON = pick("anon"), RC_SERVICE = pick("service_role");
if (!RC_ANON || !RC_SERVICE) { console.error("could not read rcxcx keys:", JSON.stringify(keys).slice(0, 300)); process.exit(1); }
console.log("rcxcx keys ok");
let look = await v("GET", "/v9/projects/edu-prod");
let id;
if (look.status === 404) {
  const c = await v("POST", "/v11/projects", { name: "edu-prod", framework: "nextjs", gitRepository: { type: "github", repo: REPO } });
  if (!c.ok) { console.error("CREATE FAILED", c.status, JSON.stringify(c.j).slice(0, 400)); process.exit(1); }
  id = c.j.id; console.log("created edu-prod:", id);
} else if (look.ok) { id = look.j.id; console.log("edu-prod exists:", id); }
else { console.error("lookup failed", look.status); process.exit(1); }
const igCmd = "bash -c 'if [ \"$VERCEL_GIT_COMMIT_REF\" = \"main\" ]; then exit 1; else exit 0; fi'";
await v("PATCH", "/v9/projects/" + id, { commandForIgnoringBuildStep: igCmd });
console.log("ignored-build-step: only main");
const overrides = {
  NEXT_PUBLIC_SUPABASE_URL: RCXCX_URL,
  SUPABASE_URL: RCXCX_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: RC_ANON,
  SUPABASE_ANON_KEY: RC_ANON,
  SUPABASE_SERVICE_ROLE_KEY: RC_SERVICE,
  NEXT_PUBLIC_SITE_URL: "https://edu.intelliverify.in",
  NEXT_PUBLIC_APP_URL: "https://edu.intelliverify.in",
  VERCEL_PROJECT_ID: id,
};
const er = await fetch("https://api.vercel.com/v9/projects/" + EDU + "/env?decrypt=true&teamId=" + TEAM, { headers: { Authorization: "Bearer " + VT } });
const envs = (await er.json()).envs || [];
console.log("cloning " + envs.length + " env vars…");
for (const e of envs) {
  const value = overrides[e.key] !== undefined ? overrides[e.key] : e.value;
  const up = await v("POST", "/v10/projects/" + id + "/env?upsert=true", {
    key: e.key, value, type: e.type, target: e.target, ...(e.gitBranch ? { gitBranch: e.gitBranch } : {}),
  });
  console.log("  " + e.key + ": " + up.status + (overrides[e.key] !== undefined ? " [->rcxcx]" : ""));
}
console.log("\nedu-prod id = " + id + " — builds main -> rcxcx. NO domain attached yet.");
