// Provision non-prod Vercel projects for the enterprise env split.
// Creates/updates edu-dev (develop branch) + edu-staging (staging branch),
// both linked to Intelliverify/edu, both pointing at the edu-nonprod Supabase DB,
// each with its own dev./staging. subdomain of edu.intelliverify.in.
//
// Idempotent: safe to re-run. Reads VERCEL_TOKEN from .env.local and the
// NONPROD_* keys from .env.nonprod.local (both gitignored). No secrets embedded.
//
// Run:  node scripts/vercel-provision.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadEnv = (f) => {
  const o = {};
  try {
    for (const l of readFileSync(join(__dirname, f), "utf-8").split(/\r?\n/)) {
      if (/^\s*#/.test(l)) continue;
      const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* file optional */ }
  return o;
};
const env = { ...loadEnv("../.env.local"), ...loadEnv("../.env.nonprod.local") };

const TOKEN = env.VERCEL_TOKEN;
const TEAM = "team_vaW4BU9CDGjRdliIEYfeEzQx";   // intelliverify-s-projects
const REPO = "Intelliverify/edu";
const NONPROD_URL = env.NONPROD_SUPABASE_URL;
const NONPROD_ANON = env.NONPROD_SUPABASE_ANON_KEY;
const NONPROD_SRV = env.NONPROD_SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN) { console.error("ERROR: VERCEL_TOKEN missing in .env.local"); process.exit(1); }
if (!NONPROD_URL || !NONPROD_ANON || !NONPROD_SRV) {
  console.error("ERROR: NONPROD_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY missing in .env.nonprod.local");
  process.exit(1);
}

const api = async (method, path, body) => {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${path}${sep}teamId=${TEAM}`;
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.ok, status: r.status, json };
};

const TARGETS = [
  { name: "edu-dev", branch: "develop", domain: "dev.edu.intelliverify.in" },
  { name: "edu-staging", branch: "staging", domain: "staging.edu.intelliverify.in" },
];

const ALL = ["production", "preview", "development"];
const envVarsFor = (domain) => ([
  { key: "NEXT_PUBLIC_SUPABASE_URL", value: NONPROD_URL, type: "plain", target: ALL },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: NONPROD_ANON, type: "plain", target: ALL },
  { key: "SUPABASE_URL", value: NONPROD_URL, type: "plain", target: ALL },
  { key: "SUPABASE_ANON_KEY", value: NONPROD_ANON, type: "encrypted", target: ALL },
  { key: "SUPABASE_SERVICE_ROLE_KEY", value: NONPROD_SRV, type: "encrypted", target: ALL },
  { key: "NEXT_PUBLIC_APP_URL", value: `https://${domain}`, type: "plain", target: ALL },
]);
// NOTE: payment/SMS/AI/push secrets (Razorpay, Twilio, Anthropic, VAPID, PUSH_*)
// are intentionally NOT set here — non-prod must use sandbox keys, added later.

for (const t of TARGETS) {
  console.log(`\n=== ${t.name}  (${t.branch} -> ${t.domain}) ===`);

  // 1) ensure the project exists + is linked to the repo
  let look = await api("GET", `/v9/projects/${t.name}`);
  let id;
  if (look.status === 404) {
    console.log("  creating project…");
    const c = await api("POST", "/v11/projects", {
      name: t.name,
      framework: "nextjs",
      gitRepository: { type: "github", repo: REPO },
    });
    if (!c.ok) { console.error("  CREATE FAILED", c.status, JSON.stringify(c.json).slice(0, 500)); continue; }
    id = c.json.id;
    console.log("  created:", id);
  } else if (look.ok) {
    id = look.json.id;
    console.log("  exists:", id);
  } else {
    console.error("  LOOKUP FAILED", look.status, JSON.stringify(look.json).slice(0, 300));
    continue;
  }

  // 2) upsert env vars (documented endpoint; works for new + existing)
  for (const ev of envVarsFor(t.domain)) {
    const up = await api("POST", `/v10/projects/${id}/env?upsert=true`, ev);
    console.log(`  env ${ev.key}: ${up.status}${up.ok ? "" : " " + JSON.stringify(up.json).slice(0, 160)}`);
  }

  // 3) production branch (undocumented; same call the dashboard makes).
  //    Try PATCH then POST; if both fail, set once in Settings -> Git -> Production Branch.
  let br = await api("PATCH", `/v9/projects/${id}/branch`, { branch: t.branch });
  if (!br.ok && (br.status === 404 || br.status === 405)) {
    br = await api("POST", `/v9/projects/${id}/branch`, { branch: t.branch });
  }
  console.log(`  production branch -> ${t.branch}: ${br.status}${br.ok ? " ok" : " (set manually if non-2xx)"}`);

  // 3b) only build THIS project's own branch (every project is linked to the same
  //     repo, so without this each one would also build the others' branches).
  //     Ignored-Build-Step: exit 0 = skip, exit 1 = build.
  const ignore = `bash -c 'if [ "$VERCEL_GIT_COMMIT_REF" = "${t.branch}" ]; then exit 1; else exit 0; fi'`;
  const ig = await api("PATCH", `/v9/projects/${id}`, { commandForIgnoringBuildStep: ignore });
  console.log(`  ignored-build-step (only ${t.branch}): ${ig.status}${ig.ok ? " ok" : " " + JSON.stringify(ig.json).slice(0, 160)}`);

  // 4) attach the subdomain (intelliverify.in DNS is in this Vercel team -> auto-verifies)
  const dm = await api("POST", `/v10/projects/${id}/domains`, { name: t.domain });
  const dmMsg = dm.ok ? "ok" : (dm.json?.error?.code === "domain_already_in_use" || dm.status === 409 ? "already attached" : JSON.stringify(dm.json).slice(0, 160));
  console.log(`  domain ${t.domain}: ${dm.status} ${dmMsg}`);
}

console.log("\nDone. Push to develop/staging to trigger the first deploys.");
console.log("Verify: https://vercel.com/intelliverify-s-projects");
