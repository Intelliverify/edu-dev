"use client";
import { getBrowserSb } from "@/lib/supabaseBrowser";
import { tooLargeMessage } from "@/lib/uploadLimit";

export type UploadedFile = { url: string; name: string; type: string };

/**
 * Upload a homework attachment (image / pdf / video) DIRECTLY to Supabase from
 * the browser via a one-time signed upload URL. This bypasses the Vercel
 * serverless body limit (~4.5 MB) that constrained the old /upload route, so
 * real videos (up to the 50 MB bucket limit) go through.
 *
 * Returns the uploaded file on success, or null after alerting the user.
 */
export async function uploadHomeworkFile(file: File): Promise<UploadedFile | null> {
  const oversize = tooLargeMessage(file);
  if (oversize) { alert(oversize); return null; }

  try {
    // 1. Ask the server (service role) for a signed upload token — tiny JSON round-trip.
    const res = await fetch("/api/teacher/homework/sign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.path || !j.token) {
      alert(j.error || "Could not start the upload. Please try again.");
      return null;
    }

    // 2. Upload the bytes straight to Supabase storage using the signed token.
    const sb = await getBrowserSb();
    const { error } = await sb.storage
      .from("homework-files")
      .uploadToSignedUrl(j.path, j.token, file, { contentType: file.type || undefined });
    if (error) {
      alert(error.message || "Upload failed. Please try again.");
      return null;
    }

    // 3. The public URL was returned with the token.
    return { url: j.publicUrl, name: file.name, type: file.type };
  } catch (e: any) {
    alert(e?.message || "Upload failed. Check your connection and try again.");
    return null;
  }
}
