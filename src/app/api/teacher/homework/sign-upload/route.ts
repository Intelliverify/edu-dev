import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAX_UPLOAD_BYTES } from "@/lib/uploadLimit";

export const runtime = "nodejs";

function sbAdmin() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}

// Mint a one-time signed upload URL so the browser can upload a homework
// attachment (image / pdf / video) DIRECTLY to Supabase storage — bypassing the
// serverless request-body limit that caps the older /upload route at ~4.5 MB.
// The response is tiny JSON, so this route itself never carries the file.
export async function POST(req: Request) {
  try {
    const { name, size, contentType } = await req.json().catch(() => ({}));

    if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. The maximum you can attach is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
        { status: 413 },
      );
    }

    const ext = String(name || "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `web/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const sb = sbAdmin();
    const { data, error } = await sb.storage.from("homework-files").createSignedUploadUrl(path);
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not start upload" }, { status: 500 });

    const { data: { publicUrl } } = sb.storage.from("homework-files").getPublicUrl(path);
    return NextResponse.json({ path: data.path, token: data.token, publicUrl, contentType: contentType || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not start upload" }, { status: 500 });
  }
}
