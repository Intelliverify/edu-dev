import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const l of readFileSync(join(__dirname, "../.env.local"), "utf-8").split(/\r?\n/)) {
  if (/^\s*#/.test(l)) continue;
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const REF = "rcxcxtxwokhlypgsmbfw", T = env.SUPABASE_ACCESS_TOKEN;
const run = async (sql) => {
  const r = await fetch("https://api.supabase.com/v1/projects/" + REF + "/database/query", {
    method: "POST", headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
const def = (name, dob, phone) => ((name || "E").charAt(0).toUpperCase()) + String(dob || "").split("-")[0] + String(phone || "").replace(/\D/g, "").slice(-4);
const res = await run("select id, phone, child_name, child_dob from public.parent_accounts");
const rows = res.j;
if (!Array.isArray(rows)) { console.error("fetch failed", res.status, JSON.stringify(res.j).slice(0, 200)); process.exit(1); }
console.log("hashing " + rows.length + " accounts…");
const ups = [];
for (const a of rows) {
  const pw = def(a.child_name, a.child_dob, a.phone);
  const hash = await bcrypt.hash(pw, 10);
  ups.push("update public.parent_accounts set password_hash='" + hash + "', is_first_login=false, is_default_password=true where id='" + a.id + "';");
}
const ap = await run(ups.join("\n"));
console.log("apply ->", ap.status);
if (ap.status >= 400) console.log(JSON.stringify(ap.j).slice(0, 400));
const c = await run("select count(*)::int total, count(*) filter (where password_hash is not null) hashed, count(*) filter (where is_first_login=false) ready from public.parent_accounts");
console.log("result:", JSON.stringify(c.j));
console.log("password = FirstLetterOfChildName + BirthYear + Last4Phone");
