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
const VT = env.VERCEL_TOKEN, LIVE = env.SUPABASE_ACCESS_TOKEN_LIVE;
const TEAM = "team_vaW4BU9CDGjRdliIEYfeEzQx", EDU = "prj_q532S7EaZj7XNSBk6jTnDnpH2DlW";
const MMZN = "mmznugcbwbjeqnmmwmxn", MMZN_URL = "https://mmznugcbwbjeqnmmwmxn.supabase.co";
if (!VT || !LIVE) { console.error("missing VERCEL_TOKEN or SUPABASE_ACCESS_TOKEN_LIVE"); process.exit(1); }
const keys = await (await fetch("https://api.supabase.com/v1/projects/" + MMZN + "/api-keys?reveal=true", { headers: { Authorization: "Bearer " + LIVE } })).json();
const pick = (n) => (Array.isArray(keys) ? (keys.find((k) => k.name === n) || {}).api_key : (keys || {})[n]);
const SRV = pick("service_role");
if (!SRV) { console.error("could not read mmzn service_role:", JSON.stringify(keys).slice(0, 200)); process.exit(1); }
console.log("mmzn service key ok");
const v = async (m, p, b) => {
  const sep = p.includes("?") ? "&" : "?";
  const r = await fetch("https://api.vercel.com" + p + sep + "teamId=" + TEAM, { method: m, headers: { Authorization: "Bearer " + VT, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { ok: r.ok, status: r.status, j };
};
const ALL = ["production", "preview", "development"];
for (const [k, val] of [["PUSH_SUPABASE_URL", MMZN_URL], ["PUSH_SUPABASE_KEY", SRV]]) {
  const up = await v("POST", "/v10/projects/" + EDU + "/env?upsert=true", { key: k, value: val, type: "plain", target: ALL });
  console.log("  " + k + ": " + up.status + (k === "PUSH_SUPABASE_URL" ? " -> mmzn" : " -> mmzn service"));
}
const pr = await v("GET", "/v9/projects/" + EDU);
const repoId = pr.j && pr.j.link && pr.j.link.repoId;
const d = await v("POST", "/v13/deployments", { name: "edu", project: EDU, target: "production", gitSource: { type: "github", ref: "main", repoId } });
console.log("evergreen redeploy:", d.status, d.ok ? (d.j.url + " | " + (d.j.readyState || d.j.status)) : JSON.stringify(d.j).slice(0, 200));
