import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getSchoolConfig } from "@/lib/getSchoolConfig";
import { sendWhatsApp } from "@/lib/twilio";
import { computeDefaultPassword, DEFAULT_PASSWORD_FORMAT_MESSAGE } from "@/lib/defaultPassword";

function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`verify-otp:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please request a new OTP." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { phone, otp, newPassword, role, resetToDefault } = body;

    // Parents can reset back to the DEFAULT password (no new password chosen);
    // everyone else (and parents who opt to) must supply a new password.
    const toDefault = role === "parent" && resetToDefault === true;

    if (!phone || !otp || !role) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    if (!["parent", "teacher"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (!toDefault && String(newPassword || "").length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return NextResponse.json({ error: "Invalid OTP format" }, { status: 400 });
    }

    const client  = sb();
    const phoneId = String(phone).trim();

    const { data: reset } = await client
      .from("password_resets")
      .select("*")
      .eq("phone", phoneId)
      .eq("otp", otp)
      .eq("role", role)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!reset) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // ── Parent: reset to the DEFAULT password ──────────
    if (toDefault) {
      const { data: account } = await client
        .from("parent_accounts").select("*").eq("phone", phoneId).maybeSingle();
      if (!account) {
        return NextResponse.json({ error: "No account found for this phone number." }, { status: 404 });
      }

      const defaultPass = computeDefaultPassword(account.child_name, account.child_dob, account.phone);
      const hash        = await bcrypt.hash(defaultPass, 10);

      await client.from("parent_accounts")
        .update({ password_hash: hash, is_first_login: false, is_default_password: true })
        .eq("phone", phoneId);
      await client.from("password_resets").update({ used: true }).eq("id", reset.id);

      // Deliver the actual password via WhatsApp only — never in the response.
      const school  = await getSchoolConfig();
      const message = `🌿 *${school.name} — Password Reset*\n\nDear Parent,\n\nYour password has been reset to default:\n\n🔑 Password: *${defaultPass}*\n\n🌐 Login: ${school.domain}/parent-login\n\n⚠️ Please change your password after login.\n\n_${school.name}_`;
      await sendWhatsApp(phoneId, message).catch(() => false);

      return NextResponse.json({ success: true, message: DEFAULT_PASSWORD_FORMAT_MESSAGE });
    }

    // ── Chosen new password (teachers, or parents who opt to) ──
    const passwordHash = await bcrypt.hash(String(newPassword).slice(0, 128), 10);

    if (role === "parent") {
      await client.from("parent_accounts")
        .update({ password_hash: passwordHash, is_first_login: false, is_default_password: false })
        .eq("phone", phoneId);
    } else if (role === "teacher") {
      await client.from("teacher_accounts")
        .update({ password_hash: passwordHash })
        .eq("username", phoneId.toLowerCase());
    }

    await client.from("password_resets").update({ used: true }).eq("id", reset.id);

    return NextResponse.json({ success: true });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
