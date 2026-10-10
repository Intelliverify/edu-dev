import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { computeDefaultPassword } from "@/lib/defaultPassword";

function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

// Authenticated password change for a logged-in parent.
// Gated by verifying the CURRENT password (works for both web-cookie and
// mobile-token clients, neither of which is required to carry a cookie here).
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    if (!rateLimit(`change-password:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { phone, currentPassword, newPassword } = body;

    if (!phone || !currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
    }

    const newStr = String(newPassword);
    if (newStr.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const client     = sb();
    const phoneClean = String(phone).replace(/\D/g, "");

    const { data: account } = await client
      .from("parent_accounts").select("*").eq("phone", phoneClean).maybeSingle();

    if (!account || !account.password_hash) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Verify the current password.
    const currentValid = await bcrypt
      .compare(String(currentPassword).slice(0, 128), account.password_hash)
      .catch(() => false);
    if (!currentValid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    // New password must not be the auto-generated default.
    const defaultPass = computeDefaultPassword(account.child_name, account.child_dob, account.phone);
    if (newStr === defaultPass) {
      return NextResponse.json({ error: "New password must be different from the default password." }, { status: 400 });
    }

    // New password must differ from the current one.
    if (newStr === String(currentPassword)) {
      return NextResponse.json({ error: "New password must be different from the current password." }, { status: 400 });
    }

    const hash = await bcrypt.hash(newStr.slice(0, 128), 10);
    await client.from("parent_accounts")
      .update({ password_hash: hash, is_first_login: false, is_default_password: false })
      .eq("phone", phoneClean);

    return NextResponse.json({ success: true });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
