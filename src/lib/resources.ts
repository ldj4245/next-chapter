import { InputError, object, uuid } from './domain.ts';

export const RESOURCE_KINDS = { article: '글', video: '영상', other: '기타' } as const;
export const RESOURCE_STATES = { saved: '예정', active: '진행 중', completed: '완료' } as const;
export type ResourceKind = keyof typeof RESOURCE_KINDS;
export type ResourceStatus = keyof typeof RESOURCE_STATES;
export type ResourceInput = { url: string; title: string; kind: ResourceKind; status: ResourceStatus; tags: string[]; memo: string };
export type LearningResource = ResourceInput & { id: string; revision: number; created_at: string; updated_at: string };
export type ResourceBookmark = { id: string; resource_id: string; seconds: number; label: string; created_at: string };
export type ResourceDetail = { resource: LearningResource; bookmarks: ResourceBookmark[] };
export const resourceColumns = 'id,url,title,kind,status,tags,memo,revision,created_at,updated_at';
export const bookmarkColumns = 'id,resource_id,seconds,label,created_at';

export function resourceURL(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) throw new InputError({ url: '웹 주소를 확인해주세요.' });
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new InputError({ url: 'https://로 시작하는 웹 주소를 입력해주세요.' }); }
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !host.includes('.') ||
      /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.') || url.href.length>2048 || /\.(?:localhost|local|internal|lan|home|test|invalid)$/i.test(host)) throw new InputError({ url: '외부 웹사이트의 http 또는 https 주소를 입력해주세요.' });
  return url.toString();
}
export function videoSource(value: string): { provider: 'youtube' | 'vimeo'; id: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const host = url.hostname.replace(/^www\./, '').toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? parts[0] : parts[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', id };
  }
  if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = parts[0] === 'video' ? parts[1] : parts[0];
    if (id && /^\d{1,12}$/.test(id)) return { provider: 'vimeo', id };
  }
  return null;
}
export function canonicalResourceURL(value: unknown): string {
  const valid = resourceURL(value), video = videoSource(valid);
  if (video?.provider === 'youtube') return 'https://www.youtube.com/watch?v=' + video.id;
  // Preserve Vimeo unlisted hashes and normal article fragments/query strings.
  return valid;
}
export function resourceHost(value: string): string { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } }
export function guessResourceKind(value: string): ResourceKind { return videoSource(value) ? 'video' : /\.pdf(?:[?#]|$)/i.test(value) ? 'other' : 'article'; }
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
}
export function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) throw new InputError({ time: '12:35 또는 1:02:35 형식으로 입력해주세요.' });
  const parts = value.trim().split(':').map(Number);
  if (parts.at(-1)! > 59 || parts.length === 3 && parts[1] > 59) throw new InputError({ time: '분과 초는 00~59 사이로 입력해주세요.' });
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}
export function timestampFromURL(value: string): number | null {
  try {
    const url = new URL(value), raw = url.searchParams.get('t') ?? url.searchParams.get('start') ?? (/^#t=/.test(url.hash) ? url.hash.slice(3) : null);
    if (!raw) return null;
    if (/^\d{1,6}s?$/.test(raw)) { const seconds = Number(raw.replace(/s$/, '')); return seconds <= 359999 ? seconds : null; }
    const match = raw.match(/^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,2})s)?$/);
    if (!match || !match[0]) return null;
    const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    return seconds <= 359999 ? seconds : null;
  } catch { return null; }
}
export function bookmarkURL(value: string, seconds: number): string | null {
  const video = videoSource(value);
  if (!video || !Number.isInteger(seconds) || seconds < 0 || seconds > 359999) return null;
  if (video.provider === 'youtube') return 'https://www.youtube.com/watch?v=' + video.id + '&t=' + seconds + 's';
  const url = new URL(value); url.hash = 't=' + seconds + 's'; return url.toString();
}
export function parseResource(value: unknown): ResourceInput {
  const input = object(value), url = canonicalResourceURL(input.url), issues: Record<string, string> = {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) issues.title = '제목을 200자 이내로 입력해주세요.';
  const kind = input.kind as ResourceKind, status = input.status as ResourceStatus;
  if (!Object.hasOwn(RESOURCE_KINDS, kind ?? '')) issues.kind = '자료 종류를 확인해주세요.';
  if (!Object.hasOwn(RESOURCE_STATES, status ?? '')) issues.status = '열람 상태를 확인해주세요.';
  let tags: string[] = [];
  if (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== 'string')) issues.tags = '태그를 확인해주세요.';
  else tags = [...new Set((input.tags as string[]).map(tag => tag.trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some(tag => tag.length > 30)) issues.tags = '태그는 30자 이내로 최대 12개까지 입력해주세요.';
  const memo = input.memo;
  if (typeof memo !== 'string' || memo.length > 10000 || memo.includes('\u0000')) issues.memo = '메모를 10,000자 이내로 입력해주세요.';
  if (Object.keys(issues).length) throw new InputError(issues);
  return { url, title, kind, status, tags, memo: memo as string };
}
export function resourceRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new InputError({ revision: '저장된 자료를 다시 확인해주세요.' });
  return value;
}
export function parseBookmark(value: unknown): { id: string; seconds: number; label: string } {
  const input = object(value), id = uuid(input.id), seconds = input.seconds, label = typeof input.label === 'string' ? input.label.trim() : '';
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 0 || seconds > 359999) throw new InputError({ time: '영상 시간을 확인해주세요.' });
  if (!label || label.length > 160) throw new InputError({ label: '구간의 내용을 160자 이내로 적어주세요.' });
  return { id, seconds, label };
}
export function mergeResourceDraft(base: ResourceInput, local: ResourceInput, remote: ResourceInput): ResourceInput {
  const result = { ...local };
  for (const key of ['url','title','kind','status'] as const) if (local[key] === base[key]) Object.assign(result,{[key]:remote[key]});
  if (local.memo === base.memo) result.memo = remote.memo;
  else if (remote.memo !== base.memo && remote.memo !== local.memo) result.memo = [remote.memo,local.memo].filter(Boolean).join('\n\n—— 이 화면에서 작성한 메모 ——\n\n');
  const tags = JSON.stringify(local.tags) === JSON.stringify(base.tags) ? remote.tags : JSON.stringify(remote.tags) === JSON.stringify(base.tags) ? local.tags : [...new Set([...remote.tags,...local.tags])];
  return parseResource({...result,tags});
}
