import 'server-only';
import { HttpError } from './api';
import type { Kind } from './domain';
import { catalogURL, plainText, wikiMatches, type CatalogItem, type CatalogResponse, type Source } from './catalog-types';
import { searchBooks, bestsellingBooks, bookById } from './yes24';

type WikiPage = { pageid: number; title: string; extract?: string; index?: number; missing?: boolean; thumbnail?: { source: string } };
type WikiResponse = { query?: { pages?: WikiPage[] }; error?: { code: string } };
type OpenWork = { title: string; description?: string | { value: string }; covers?: number[]; authors?: { author?: { key: string } }[]; first_publish_date?: string };
type Show = { id: number; name: string; url: string; premiered?: string; summary?: string; language?: string; genres?: string[]; averageRuntime?: number; runtime?: number; image?: { original: string } };
async function fetchData<T>(url: URL | string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NextChapter/2.0 (personal-library; https://next-chapter-steel-three.vercel.app)', Accept: 'application/json' },
    next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new HttpError(502, '작품 정보 제공처에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
  return response.json() as Promise<T>;
}
function wikiURL(language: string, options: Record<string, string>) {
  const url = new URL('https://' + language + '.wikipedia.org/w/api.php');
  Object.entries({ action: 'query', prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '600', pilicense: 'any', exintro: '1', explaintext: '1', exsentences: '5', format: 'json', formatversion: '2', ...options }).forEach(([key,value]) => url.searchParams.set(key,value));
  return url;
}
function fromWiki(page: WikiPage, kind: Kind, language: string): CatalogItem {
  const description = plainText(page.extract), first = description.slice(0,400);
  const year = first.match(/(?:18|19|20)\d{2}/)?.[0];
  const creator = first.match(/([가-힣· ]{2,30})(?:의|가|이) (?:쓴|집필|연출|감독|제작)/)?.[1]?.trim() ?? '';
  return {
    source: 'wikipedia', source_id: language + ':' + page.pageid,
    source_url: 'https://' + language + '.wikipedia.org/wiki/' + encodeURIComponent(page.title.replaceAll(' ', '_')),
    kind, title: page.title.replace(/ \((?:영화|소설|드라마|책|film|novel)\)$/, '').slice(0,100),
    creator: creator.slice(0,160), year: year ? Number(year) : null, description,
    cover_url: catalogURL(page.thumbnail?.source, true), minutes: null,
  };
}
async function wikiSearch(query: string, kind: Kind, language = 'ko') {
  const noun = language === 'ko' ? { book: '소설 책', movie: '영화', drama: '드라마' }[kind] : { book: 'novel book', movie: 'film', drama: 'television series' }[kind];
  const result = await fetchData<WikiResponse>(wikiURL(language, { generator: 'search', gsrsearch: query + ' ' + noun, gsrlimit: '24', gsrnamespace: '0' }));
  if (result.error) throw new HttpError(502, '작품 검색을 완료하지 못했어요. 다시 시도해주세요.');
  return (result.query?.pages ?? []).sort((a,b) => (a.index ?? 0) - (b.index ?? 0)).filter(page => !page.missing && wikiMatches(page.extract ?? '', page.title, kind)).map(page => fromWiki(page,kind,language));
}
function fromShow(show: Show): CatalogItem {
  return { source:'tvmaze',source_id:String(show.id),source_url:catalogURL(show.url),kind:'drama',title:show.name.slice(0,100),creator:'',year:show.premiered ? Number(show.premiered.slice(0,4)) : null,description:plainText(show.summary),cover_url:catalogURL(show.image?.original,true),minutes:show.averageRuntime??show.runtime??null };
}
export async function searchCatalog(query: string, kind: Kind): Promise<CatalogResponse> {
  if (kind === 'book') return searchBooks(query);
  const tasks: Promise<CatalogItem[]>[] = [wikiSearch(query,kind)];
  if (kind === 'drama' && !/[가-힣]/.test(query)) tasks.push(fetchData<{ show: Show }[]>('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(query)).then(rows=>rows.map(row=>fromShow(row.show))));
  const results = await Promise.allSettled(tasks);
  let items = results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  if (!items.length && !/[가-힣]/.test(query)) { try { items = await wikiSearch(query,kind,'en'); } catch {} }
  if (!items.length && results.every(result=>result.status==='rejected')) throw new HttpError(502,'작품 검색 제공처가 응답하지 않아요. 잠시 후 다시 시도해주세요.');
  return { items: items.slice(0,24), notice: results.some(result=>result.status==='rejected') ? '일부 출처에 연결하지 못해 다른 출처의 검색 결과를 표시했어요.' : '' };
}
const featured: Record<Kind,string[]> = {
  movie: ['기생충 (영화)','인터스텔라','헤어질 결심','듄 (2021년 영화)','그랜드 부다페스트 호텔','이터널 선샤인','위플래쉬','라라랜드'],
  book: [],
  drama: ['나의 아저씨','더 글로리','오징어 게임','브레이킹 배드','미스터 션샤인','응답하라 1988','왕좌의 게임 (드라마)','이상한 변호사 우영우'],
};
export async function discoverCatalog(kind: Kind): Promise<CatalogResponse> {
  if (kind === 'book') return bestsellingBooks();
  const result = await fetchData<WikiResponse>(wikiURL('ko',{ titles: featured[kind].join('|'), redirects:'1' }));
  const items = (result.query?.pages??[]).filter(page=>!page.missing).map(page=>fromWiki(page,kind,'ko'));
  return { items: items.sort((a,b)=>Number(Boolean(b.cover_url))-Number(Boolean(a.cover_url))),notice:'' };
}
export async function catalogItem(source: Source, id: string, kind: Kind): Promise<CatalogItem> {
  if (source === 'yes24') {
    if (kind !== 'book') throw new HttpError(400, '예스24 도서는 책으로 가져와주세요.');
    return bookById(id);
  }
  if (source === 'wikipedia' && /^(ko|en):[1-9]\d{0,11}$/.test(id)) {
    const [language,pageid] = id.split(':');
    const result = await fetchData<WikiResponse>(wikiURL(language,{pageids:pageid}));
    const page = result.query?.pages?.[0];
    if (!page || page.missing || !wikiMatches(page.extract??'',page.title,kind)) throw new HttpError(404,'이 종류의 작품 정보를 찾을 수 없어요.');
    return fromWiki(page,kind,language);
  }
  if (source==='tvmaze' && kind==='drama' && /^[1-9]\d{0,10}$/.test(id)) return fromShow(await fetchData<Show>('https://api.tvmaze.com/shows/'+id));
  if (source==='openlibrary' && kind==='book' && /^OL\d{1,12}W$/.test(id)) {
    const book=await fetchData<OpenWork>('https://openlibrary.org/works/'+id+'.json');
    const authors=await Promise.all((book.authors??[]).slice(0,3).map(async row=>{ const key=row.author?.key; if(!key||!/^\/authors\/OL\d+A$/.test(key))return ''; try{return (await fetchData<{name:string}>('https://openlibrary.org'+key+'.json')).name;}catch{return '';} }));
    const year=book.first_publish_date?.match(/(?:18|19|20)\d{2}/)?.[0];
    return { source,source_id:id,source_url:'https://openlibrary.org/works/'+id,kind,title:book.title.slice(0,100),creator:authors.filter(Boolean).join(', ').slice(0,160),year:year?Number(year):null,description:plainText(typeof book.description==='object'?book.description.value:book.description),cover_url:book.covers?.[0]&&book.covers[0]>0?'https://covers.openlibrary.org/b/id/'+book.covers[0]+'-L.jpg?default=false':'',minutes:null };
  }
  throw new HttpError(400,'작품 출처와 식별자를 확인해주세요.');
}
