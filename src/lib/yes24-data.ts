import { catalogURL, plainText, type CatalogItem } from './catalog-types.ts';

export type Yes24Book = {
  itemId?: number; title?: string; author?: string; goodsType?: string;
  publishDate?: string; cover?: string;
  contentDetail?: { bookIntroduction?: string | null; bookSummary?: string | null } | null;
};
export type Yes24Response = {
  success: boolean; errorCode?: string | null;
  data?: { items?: Yes24Book[]; totalCount?: number } | null;
};

function introduction(value: unknown): string {
  if (typeof value !== 'string') return '';
  return plainText(value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/g, '＜').replace(/&gt;/g, '＞')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex: string | undefined, decimal: string | undefined) => {
      const code = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }), 10000).replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
}

export function fromYes24(book: Yes24Book): CatalogItem | null {
  if (!Number.isSafeInteger(book.itemId) || !book.itemId || book.itemId < 1 ||
      typeof book.title !== 'string' || !book.title.trim() ||
      !['도서', '국내도서', '외국도서', '외서', 'eBook', '전자책'].includes(book.goodsType ?? '')) return null;
  const year = typeof book.publishDate === 'string' ? Number(book.publishDate.slice(0, 4)) : NaN;
  return {
    source: 'yes24', source_id: String(book.itemId),
    source_url: 'https://www.yes24.com/product/goods/' + book.itemId,
    kind: 'book', title: plainText(book.title, 100), creator: plainText(book.author, 160),
    year: Number.isInteger(year) && year >= 1000 && year <= 2100 ? year : null,
    description: introduction(book.contentDetail?.bookIntroduction || book.contentDetail?.bookSummary),
    cover_url: catalogURL(book.cover, true), minutes: null,
  };
}

export function yes24Items(response: Yes24Response): CatalogItem[] {
  return (Array.isArray(response.data?.items) ? response.data.items : [])
    .filter((book): book is Yes24Book => Boolean(book && typeof book === 'object'))
    .map(fromYes24).filter((book): book is CatalogItem => book !== null);
}
