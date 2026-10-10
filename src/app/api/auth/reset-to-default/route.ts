import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sendWhatsApp } from "@/lib/twilio";
import { getSchoolConfig } from "@/lib/getSchoolConfig";
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
    if (!rateLimit(`reset-default:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { phone, dob, last4 } = body;

    if (!phone || !dob || !last4) {
      return NextResponse.json({ error: "Phone, date of birth and last 4 digits required" }, { status: 400 });
    }

    if (!/^\d{4}$/.test(String(last4).trim())) {
      return NextResponse.json({ error: "Last 4 digits must be 4 numbers" }, { status: 400 });
    }

    const client     = sb();
    const phoneClean = String(phone).replace(/\D/g, "");

    const { data: account } = await client
      .from("parent_accounts").select("*").eq("phone", phoneClean).maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "No account found for this phone number." }, { status: 404 });
    }

    if (account.child_dob !== dob) {
      return NextResponse.json({ error: "Date of birth does not match." }, { status: 401 });
    }

    if (phoneClean.slice(-4) !== String(last4).trim()) {
      return NextResponse.json({ error: "Last 4 digits do not match." }, { status: 401 });
    }

    // Regenerate default password and mark the account as back on the default.
    const defaultPass = computeDefaultPassword(account.child_name, dob, phoneClean);
    const hash        = await bcrypt.hash(defaultPass, 10);

    await client.from("parent_accounts")
      .update({ password_hash: hash, is_first_login: false, is_default_password: true })
      .eq("phone", phoneClean);

    // Deliver the actual password via WhatsApp only — never in the HTTP response.
    const school  = await getSchoolConfig();
    const message = `🌿 *${school.name} — Password Reset*\n\nDear Parent,\n\nYour password has been reset to default:\n\n🔑 Password: *${defaultPass}*\n\n🌐 Login: ${school.domain}/parent-login\n\n⚠️ Please change your password after login.\n\n_${school.name}_`;
    const sent    = await sendWhatsApp(phoneClean, message);
    const waUrl   = sent ? null : `https://wa.me/91${phoneClean}?text=${encodeURIComponent(message)}`;

    // Response describes the FORMAT only (no plaintext password).
    return NextResponse.json({ success: true, sent, waUrl, message: DEFAULT_PASSWORD_FORMAT_MESSAGE });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
