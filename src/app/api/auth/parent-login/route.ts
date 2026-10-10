import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { signParentSession, PARENT_COOKIE_NAME, PARENT_MAX_AGE } from "@/lib/parentSession";
import { getSchoolConfig } from "@/lib/getSchoolConfig";
import { sendWhatsApp } from "@/lib/twilio";
import { computeDefaultPassword } from "@/lib/defaultPassword";

function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

// Dummy hash for timing-safe comparison when account not found
const DUMMY_HASH = "$2b$10$dummyhashfortimingattackpreventionxxxxxxxxxxxxxxxx";

export async function POST(req: Request) {
  try {
    // Rate limit: 10 attempts per IP per 15 minutes
    const ip = getClientIp(req);
    if (!rateLimit(`parent-login:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { phone, dob, last4, password, action, childName, childDob, enquiryId } = body;

    if (!phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });

    // Validate phone format — digits only, 10 digits
    const phoneClean = String(phone).replace(/\D/g, "");
    if (phoneClean.length < 10) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const client = sb();

    // ── CREATE account after enquiry ──────────────────
    if (action === "create") {
      const { data: existing } = await client
        .from("parent_accounts").select("id,child_dob,child_name,enquiry_id").eq("phone", phoneClean).maybeSingle();

      if (existing) {
        // Patch null DOB / null child_name if the caller now provides them
        // (handles accounts created before mobile app was updated to pass these fields)
        const patch: Record<string, string> = {};
        if (!existing.child_dob  && childDob)   patch.child_dob  = childDob;
        if (!existing.child_name && childName)   patch.child_name = childName;
        if (!existing.enquiry_id && enquiryId)   patch.enquiry_id = enquiryId;
        if (Object.keys(patch).length > 0) {
          await client.from("parent_accounts").update(patch).eq("phone", phoneClean);
        }
        return NextResponse.json({ success: true, message: "Account already exists" });
      }

      const { error: ie } = await client.from("parent_accounts").insert({
        phone:          phoneClean,
        child_name:     childName || null,
        child_dob:      childDob  || null,
        enquiry_id:     enquiryId || null,
        is_first_login: true,
      });
      if (ie) return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
      return NextResponse.json({ success: true, created: true });
    }

    // ── FIRST TIME LOGIN ──────────────────────────────
    if (action === "first-login") {
      if (!dob || !last4) {
        return NextResponse.json({ error: "DOB and last 4 digits required" }, { status: 400 });
      }

      // Validate last4 is exactly 4 digits
      if (!/^\d{4}$/.test(String(last4).trim())) {
        return NextResponse.json({ error: "Last 4 digits must be 4 numbers" }, { status: 400 });
      }

      const { data: account } = await client
        .from("parent_accounts").select("*").eq("phone", phoneClean).maybeSingle();

      if (!account) return NextResponse.json({ error: "No account found. Please enquire first." }, { status: 404 });
      if (!account.is_first_login) {
        return NextResponse.json({ error: "Account already set up. Use your password.", alreadySetup: true }, { status: 400 });
      }

      // Verify DOB (compare dates as strings to avoid timezone issues)
      if (account.child_dob !== dob) {
        return NextResponse.json({ error: "Date of birth does not match." }, { status: 401 });
      }

      // Verify last 4 digits
      if (phoneClean.slice(-4) !== String(last4).trim()) {
        return NextResponse.json({ error: "Last 4 digits do not match." }, { status: 401 });
      }

      // Generate and HASH the initial (default) password before storing
      const autoPass = computeDefaultPassword(account.child_name, dob, phoneClean);
      const hash     = await bcrypt.hash(autoPass, 10);

      await client.from("parent_accounts").update({
        password_hash:       hash,
        is_first_login:      false,
        is_default_password: true, // parent starts on the default password
        last_login:          new Date().toISOString(),
      }).eq("phone", phoneClean);

      // Send credentials via Twilio WhatsApp — not in the JSON body
      const school = await getSchoolConfig();
      const waMsg  = `🌿 *${school.name} — Parent Portal*\n\nDear Parent,\n\nYour login has been created!\n\n🔐 *Login Credentials:*\n📱 Username: ${phoneClean}\n🔑 Password: ${autoPass}\n\n🌐 Login: ${school.domain}/parent-login\n\n⚠️ Please save this password and change it after first login.\n\n_${school.name} · ${school.contact.phone}_`;
      const sent   = await sendWhatsApp(phoneClean, waMsg);
      const waUrl  = sent ? null : `https://wa.me/91${phoneClean}?text=${encodeURIComponent(waMsg)}`;

      // Set session cookie so parent can access dashboard immediately
      const token = await signParentSession({
        phone:     phoneClean,
        childName: account.child_name || "",
        enquiryId: account.enquiry_id || "",
      });

      const res = NextResponse.json({
        success:    true,
        firstLogin: true,
        childName:  account.child_name,
        enquiryId:  account.enquiry_id,
        sent,
        waUrl,
      });
      res.cookies.set(PARENT_COOKIE_NAME, token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", maxAge: PARENT_MAX_AGE, path: "/",
      });
      return res;
    }

    // ── REGULAR LOGIN ─────────────────────────────────
    if (action === "login") {
      if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 });

      const passwordStr = String(password).slice(0, 128);

      const { data: account } = await client
        .from("parent_accounts").select("*").eq("phone", phoneClean).maybeSingle();

      // Always run bcrypt even when account not found (prevents timing-based enumeration)
      const hashToCheck = account?.password_hash ?? DUMMY_HASH;
      let passwordValid = await bcrypt.compare(passwordStr, hashToCheck).catch(() => false);

      // Backward compat: check plaintext for accounts not yet migrated, then rehash
      if (!passwordValid && account && account.password_hash === passwordStr) {
        passwordValid = true;
        const newHash = await bcrypt.hash(passwordStr, 10);
        await client.from("parent_accounts").update({ password_hash: newHash }).eq("phone", phoneClean);
      }

      if (!account || !passwordValid) {
        return NextResponse.json({ error: "Incorrect phone number or password." }, { status: 401 });
      }

      if (account.is_first_login) {
        return NextResponse.json({ error: "Please complete first-time setup.", needsSetup: true }, { status: 400 });
      }

      // Update last login (fire-and-forget)
      client.from("parent_accounts").update({ last_login: new Date().toISOString() }).eq("phone", phoneClean).then(() => {});

      const token = await signParentSession({
        phone:     phoneClean,
        childName: account.child_name || "",
        enquiryId: account.enquiry_id || "",
      });

      const res = NextResponse.json({
        success:           true,
        phone:             phoneClean,
        childName:         account.child_name,
        studentId:         account.student_id,
        enquiryId:         account.enquiry_id,
        isDefaultPassword: account.is_default_password !== false, // true unless explicitly cleared
      });
      res.cookies.set(PARENT_COOKIE_NAME, token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", maxAge: PARENT_MAX_AGE, path: "/",
      });
      return res;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
