import type { Kind } from './domain';
export const SOURCES = { yes24: '예스24', wikipedia: '위키백과', openlibrary: 'Open Library', tvmaze: 'TVmaze' } as const;
export type Source = keyof typeof SOURCES;
export type CatalogItem = {
  source: Source; source_id: string; source_url: string; kind: Kind;
  title: string; creator: string; year: number | null; description: string;
  cover_url: string; minutes: number | null;
};
export type CatalogResponse = { items: CatalogItem[]; notice: string };
const imageHosts = new Set(['image.yes24.com', 'upload.wikimedia.org', 'thumb.wikimedia.org', 'covers.openlibrary.org', 'static.tvmaze.com']);
const sourceHosts = new Set(['www.yes24.com', 'ko.wikipedia.org', 'en.wikipedia.org', 'openlibrary.org', 'www.tvmaze.com']);
export function catalogURL(value: unknown, image = false): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (image ? imageHosts : sourceHosts).has(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}
export function plainText(value: unknown, limit = 3000) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, limit) : '';
}
export function wikiMatches(description: string, title: string, kind: Kind) {
  const intro = description.split('\n')[0].slice(0, 350);
  if (/^(?!《).{0,140}(?:배우|영화 감독|작가|시인|가수|actor|director|writer|actress)[이다\s,.(]/i.test(intro)) return false;
  if (kind === 'movie') return /\(.*영화.*\)|\(.*film.*\)/i.test(title) || /영화(?:이다|다|이자|이며|로,)|(?:is|was) (?:a|an) .{0,100}film/i.test(intro);
  if (kind === 'drama') return /드라마|텔레비전 시리즈|시트콤|미니시리즈|television series|TV series|sitcom/i.test(intro);
  return /소설|소설집|시집|에세이|산문집|저서|novel|non-fiction book|memoir|short story collection/i.test(intro);
}
