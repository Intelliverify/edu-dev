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
const SRC = "mmznugcbwbjeqnmmwmxn", DST = "rcxcxtxwokhlypgsmbfw";
const SRC_T = env.SUPABASE_ACCESS_TOKEN_LIVE, DST_T = env.SUPABASE_ACCESS_TOKEN;
if (!SRC_T || !DST_T) { console.error("missing SUPABASE_ACCESS_TOKEN_LIVE or SUPABASE_ACCESS_TOKEN"); process.exit(1); }
const run = async (ref, token, sql) => {
  const r = await fetch("https://api.supabase.com/v1/projects/" + ref + "/database/query", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
const CN = ["Aarav","Diya","Vivaan","Ananya","Aditya","Isha","Arjun","Saanvi","Reyansh","Myra","Kabir","Anika","Vihaan","Navya","Ishaan","Kiara"];
const SN = ["Sharma","Verma","Patel","Reddy","Nair","Gupta","Singh","Rao","Iyer","Das"];
const PN = ["Rahul","Priya","Amit","Sneha","Vikram","Pooja","Suresh","Divya","Manish","Kavya"];
const child = (i) => CN[i % CN.length] + " " + SN[(i * 3) % SN.length];
const parent = (i) => PN[i % PN.length] + " " + SN[(i * 3) % SN.length];
const phone = (base, i) => "9" + String(base + i).padStart(9, "0").slice(0, 9);
const email = (p, i) => p + i + "@demo.example.com";
const dobYear = (d) => (d ? String(d).slice(0, 4) + "-01-01" : "2020-01-01");
const anon = {
  parent_accounts: (r, i) => ({ ...r, phone: phone(100000000, i), child_name: child(i), child_dob: dobYear(r.child_dob), password_hash: null, last_login: null, is_first_login: true, is_default_password: true, student_id: null }),
  enquiries: (r, i) => ({ ...r, child_name: child(i), child_dob: dobYear(r.child_dob), phone: phone(200000000, i), parent_name: parent(i), father_name: parent(i), mother_name: parent(i + 1), father_phone: phone(210000000, i), mother_phone: phone(220000000, i), guardian_phone: phone(230000000, i), emergency_contact: phone(240000000, i), email: email("enq", i), address: null, allergies: null, blood_group: null, notes: null, photo_url: null }),
  staff: (r, i) => ({ ...r, name: "Staff " + (i + 1), email: email("staff", i + 1), phone: phone(300000000, i), address: null, dob: null, notes: null, photo_url: null, user_id: null }),
  homework_status: (r, i) => ({ ...r, child_name: "Student " + (i + 1), parent_doubt: null, teacher_reply: null, doubt_file_url: null, proof_file_url: null }),
  channel_members: (r, i) => ({ ...r, display_name: "Member " + (i + 1), user_ref: "demo-" + (i + 1) }),
  community_messages: (r, i) => ({ ...r, display_name: "Member", content: "Welcome to the community!", image_url: null }),
  sections: (r) => ({ ...r, class_teacher: null, class_teacher_id: null }),
  homework: (r) => ({ ...r, assigned_by: "Teacher" }),
  school_settings: (r) => ({ ...r, school_name: "Intelliverify Demo School", trust_name: "Intelliverify", address: "Demo Campus", phone: "9000000000", email: "demo@intelliverify.in", pan_number: null, gst_number: null }),
};
const ORDER = ["programmes","programme_items","sections","school_settings","staff","homework","enquiries","parent_accounts","homework_status","community_channels","channel_members","community_messages","attendance"];
const stmts = [];
for (const t of ORDER) {
  const res = await run(SRC, SRC_T, "select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) j from public." + t + " x");
  let rows = res.j && res.j[0] && res.j[0].j;
  if (!Array.isArray(rows)) { console.error("fetch " + t + " failed:", res.status, JSON.stringify(res.j).slice(0, 150)); process.exit(1); }
  if (anon[t]) rows = rows.map((r, i) => anon[t](r, i));
  console.log("  " + t + ": " + rows.length + " rows");
  if (!rows.length) continue;
  const js = JSON.stringify(rows);
  stmts.push("insert into public." + t + " select * from jsonb_populate_recordset(null::public." + t + ", $seed$" + js + "$seed$::jsonb) on conflict do nothing;");
}
const sql = "set session_replication_role = replica;\n" + stmts.join("\n") + "\nset session_replication_role = origin;";
console.log("\nApplying seed (" + sql.length + " bytes) to product-prod rcxcx…");
const ap = await run(DST, DST_T, sql);
console.log("apply ->", ap.status);
if (ap.status >= 400) { console.log(JSON.stringify(ap.j).slice(0, 800)); process.exit(1); }
for (const t of ["parent_accounts","enquiries","staff","sections","programmes","homework"]) {
  const c = await run(DST, DST_T, "select count(*)::int c from public." + t);
  console.log("  " + t + ":", JSON.stringify(c.j).slice(0, 60));
}
console.log("Done. PII masked; logins default; school rebranded.");
