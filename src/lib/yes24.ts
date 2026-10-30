import 'server-only';
import { HttpError } from './api';
import { yes24Items, type Yes24Response } from './yes24-data';

async function queryYes24(endpoint: string, params: Record<string, string>) {
  const key = process.env.YES24_API_KEY?.trim();
  if (!key) throw new HttpError(503, '도서 검색 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.');
  const url = new URL('https://apis.yes24.com/v1/' + endpoint);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000), redirect: 'error',
    });
  } catch {
    throw new HttpError(502, '예스24에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (response.status === 429) throw new HttpError(503, '도서 검색 요청이 많아요. 잠시 후 다시 시도해주세요.');
  if (response.status === 400) {
    const error = await response.json().catch(() => null) as Yes24Response | null;
    if (error?.errorCode === 'PARAM_004') throw new HttpError(400, '도서 식별자를 확인해주세요.');
    throw new HttpError(502, '예스24 도서 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  if (response.status === 404) {
    const error = await response.json().catch(() => null) as Yes24Response | null;
    if (endpoint === 'goods/itemList' && error?.errorCode === 'SEARCH_001') return [];
    throw new HttpError(404, '예스24에서 해당 도서를 찾을 수 없어요.');
  }
  if (!response.ok) throw new HttpError(502, '예스24 도서 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  let data: Yes24Response;
  try { data = await response.json() as Yes24Response; }
  catch { throw new HttpError(502, '예스24 응답을 읽지 못했어요. 다시 시도해주세요.'); }
  if (!data || data.success !== true || !Array.isArray(data.data?.items)) {
    throw new HttpError(502, '예스24 도서 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  return yes24Items(data);
}

export async function searchBooks(query: string) {
  return { items: await queryYes24('goods/itemList', { query, category: 'BOOK', page: '1', pageSize: '24' }), notice: '' };
}

export async function bestsellingBooks() {
  return { items: await queryYes24('category/bestseller', { categoryId: '001', page: '1', pageSize: '24' }), notice: '' };
}

export async function bookById(id: string) {
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new HttpError(400, '도서 식별자를 확인해주세요.');
  const items = await queryYes24('goods/itemDetail', { searchType: 'ItemId', query: id });
  const book = items.find(item => item.source_id === id);
  if (!book) throw new HttpError(404, '예스24에서 해당 도서를 찾을 수 없어요.');
  return book;
}
