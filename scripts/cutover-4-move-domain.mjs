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
const VT = env.VERCEL_TOKEN, TEAM = "team_vaW4BU9CDGjRdliIEYfeEzQx";
const EDU = "prj_q532S7EaZj7XNSBk6jTnDnpH2DlW", EDUPROD = "prj_ali97bk3DYkr87tBrvja3h8rC3UT", D = "edu.intelliverify.in";
const v = async (m, p, b) => {
  const sep = p.includes("?") ? "&" : "?";
  const r = await fetch("https://api.vercel.com" + p + sep + "teamId=" + TEAM, { method: m, headers: { Authorization: "Bearer " + VT, "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { ok: r.ok, status: r.status, j };
};
const rm = await v("DELETE", "/v9/projects/" + EDU + "/domains/" + D);
console.log("remove from edu:", rm.status, rm.ok ? "ok" : JSON.stringify(rm.j).slice(0, 160));
const add = await v("POST", "/v10/projects/" + EDUPROD + "/domains", { name: D });
console.log("add to edu-prod:", add.status, add.ok ? "ok" : JSON.stringify(add.j).slice(0, 160));
const ver = await v("GET", "/v9/projects/" + EDUPROD + "/domains/" + D);
console.log("edu-prod domain verified:", ver.j && ver.j.verified);
