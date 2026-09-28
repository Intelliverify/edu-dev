// Shared client-side upload size guard for homework attachments (web).
//
// The Supabase storage bucket rejects files above its per-file limit (50 MB on the
// default plan). We stop oversized files on the client and show a clear message
// instead of letting the upload fail with an opaque error.
//
// Homework attachments upload DIRECTLY to Supabase from the browser via a signed
// upload URL (see lib/uploadHomeworkFile.ts + api/teacher/homework/sign-upload),
// so this 50 MB bucket limit — not the ~4.5 MB Vercel serverless body cap — is the
// real ceiling. Raise both together if the bucket limit is increased.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Returns an error message if the file is too large, or null if it's fine.
export function tooLargeMessage(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This file is ${humanSize(file.size)}. The maximum you can attach is ${humanSize(
      MAX_UPLOAD_BYTES,
    )}. Please choose a smaller file, or compress the video before attaching.`;
  }
  return null;
}
