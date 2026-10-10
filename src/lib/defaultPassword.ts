// Single source of truth for the parent DEFAULT password.
//
// Format: <FirstLetterOfChildName uppercased><BirthYear (YYYY)><Last4OfPhone>
// Example: child "Lekhya", DOB 2020-xx-xx, phone 1234567890 -> "L20207890".
//
// This MUST stay identical to the mobile mirror in iVaApp/src/lib/api.ts.
// Do not inline the formula anywhere else — import this instead.

/** Compute the default password from a parent_accounts row's fields. */
export function computeDefaultPassword(
  childName: string | null | undefined,
  childDob: string | null | undefined, // "YYYY-MM-DD"
  phone: string | null | undefined
): string {
  const initial = (childName || "E").charAt(0).toUpperCase();
  const year = String(childDob || "").split("-")[0];
  const last4 = String(phone || "").replace(/\D/g, "").slice(-4);
  return `${initial}${year}${last4}`;
}

/**
 * Message shown to a parent after their password is reset to the default.
 * Deliberately describes the FORMAT only — never the actual password.
 */
export const DEFAULT_PASSWORD_FORMAT_MESSAGE =
  "Your password has been reset to the default password. " +
  "Your default password is: First letter of your child's name + Year of birth + " +
  "Last 4 digits of your registered phone number. " +
  "Example: Child's name Lekhya, born 2020, phone 1234567890 → L20207890. " +
  "Please log in and change your password.";
