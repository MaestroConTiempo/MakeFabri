const REVIEWED_HIGHLIGHTS_KEY = 'mt_reviewed_highlights';

export function getReviewedHighlightIds(): Set<string> {
  const raw = localStorage.getItem(REVIEWED_HIGHLIGHTS_KEY);
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeReviewedHighlightIds(ids: Set<string>) {
  localStorage.setItem(REVIEWED_HIGHLIGHTS_KEY, JSON.stringify(Array.from(ids)));
}

export function markHighlightReviewed(id: string) {
  const ids = getReviewedHighlightIds();
  ids.add(id);
  writeReviewedHighlightIds(ids);
}

export function unmarkHighlightReviewed(id: string) {
  const ids = getReviewedHighlightIds();
  if (!ids.delete(id)) return;
  writeReviewedHighlightIds(ids);
}

export function isHighlightReviewed(id: string): boolean {
  return getReviewedHighlightIds().has(id);
}
