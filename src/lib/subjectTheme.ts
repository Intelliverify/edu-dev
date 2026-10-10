// Per-subject colour + emoji so each subject reads at a glance.
// Keyword-matched first, then a stable hash fallback so unknown subjects
// still get a consistent colour across renders.

export type SubjectTheme = { color: string; bg: string; emoji: string };

const MAP: { keys: string[]; color: string; bg: string; emoji: string }[] = [
  { keys: ["math", "maths", "number", "arith", "count"], color: "#3B82F6", bg: "#EFF6FF", emoji: "🔢" },
  { keys: ["english", "phonic", "reading", "spelling", "grammar"], color: "#178F78", bg: "#EEF8F6", emoji: "📖" },
  { keys: ["science", "evs", "environment", "nature"], color: "#16A34A", bg: "#F0FDF4", emoji: "🔬" },
  { keys: ["hindi"], color: "#E8694A", bg: "#FEF2EE", emoji: "✍️" },
  { keys: ["telugu", "tamil", "kannada", "language"], color: "#EC4899", bg: "#FDF2F8", emoji: "🗣️" },
  { keys: ["art", "draw", "craft", "colour", "color", "paint"], color: "#F59E0B", bg: "#FFFBEB", emoji: "🎨" },
  { keys: ["music", "rhyme", "song", "dance"], color: "#D946EF", bg: "#FDF4FF", emoji: "🎵" },
  { keys: ["story", "library", "lib"], color: "#6366F1", bg: "#EEF2FF", emoji: "📚" },
  { keys: ["gk", "general", "know", "quiz"], color: "#06B6D4", bg: "#ECFEFF", emoji: "🧠" },
  { keys: ["computer", "coding", "tech"], color: "#475569", bg: "#F1F5F9", emoji: "💻" },
  { keys: ["sport", "pe", "physical", "yoga", "play"], color: "#EF4444", bg: "#FEF2F2", emoji: "⚽" },
  { keys: ["social", "history", "geo", "civic"], color: "#0EA5E9", bg: "#F0F9FF", emoji: "🌍" },
];

const PALETTE: SubjectTheme[] = [
  { color: "#3B82F6", bg: "#EFF6FF", emoji: "📘" },
  { color: "#8B5CF6", bg: "#F5F3FF", emoji: "📝" },
  { color: "#16A34A", bg: "#F0FDF4", emoji: "🌟" },
  { color: "#E8694A", bg: "#FEF2EE", emoji: "✏️" },
  { color: "#EC4899", bg: "#FDF2F8", emoji: "🎒" },
  { color: "#06B6D4", bg: "#ECFEFF", emoji: "📎" },
];

export function getSubjectTheme(subject?: string | null): SubjectTheme {
  const s = (subject || "").toLowerCase().trim();
  if (!s) return { color: "#178F78", bg: "#EEF8F6", emoji: "📚" };
  for (const e of MAP) if (e.keys.some((k) => s.includes(k))) return { color: e.color, bg: e.bg, emoji: e.emoji };
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
