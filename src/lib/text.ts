// Small wording helpers.

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** ['a', 'b', 'c'] → 'a, b and c'. */
export function shortList(items: string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** First user-visible character (keeps multi-part emoji like 👩‍💻 whole). */
export function firstGrapheme(s: unknown): string {
  const text = typeof s === 'string' ? s.trim() : '';
  if (!text) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const first = new Intl.Segmenter().segment(text)[Symbol.iterator]().next().value;
    return first ? first.segment.slice(0, 16) : '';
  }
  return [...text][0] ?? '';
}

/** Percentage, rounded: 0.333 → 33. */
export const pct = (x: number) => Math.round(100 * x);
