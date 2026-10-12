export function uniqueStrings(values, max = 40) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 48) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function slugify(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isGenericSeasonTitle(title) {
  return /^(season|part|cour)\s*\d+$/i.test(String(title || "").trim());
}

export function numberOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
