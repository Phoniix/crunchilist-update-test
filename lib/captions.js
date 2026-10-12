// Which YouTube caption track to ask for when a trailer has no English one.
// Returns null when English already exists (YouTube picks it from cc_lang_pref) or nothing usable is there.
// Auto-generated ("asr") tracks are skipped: translating auto-captions of a music-heavy trailer is mostly noise.
export function translatedTrack(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  if (!list.length || list.some((track) => /^en\b/i.test(track?.languageCode || ""))) return null;
  const source = list.find((track) => track?.languageCode && track.kind !== "asr");
  return source ? { languageCode: source.languageCode, translationLanguage: { languageCode: "en" } } : null;
}
