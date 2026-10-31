import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createData, ArweaveSigner, DataItem, type JWKInterface } from '@dha-team/arbundles';
import { allRows, HttpError } from './api';
import { requireAccountSession } from './account-server';
import { ARCHIVE_COLUMNS, MAX_ARCHIVE_BYTES, buildArchiveDocument, parseArchiveEnvelope, type ArchiveOptions, type ArchiveRecord, type ArchiveEnvelope, type ArchiveCounts, type ArchiveSource } from './archive';

type Client = Awaited<ReturnType<typeof requireAccountSession>>['client'];
type StoredArchive = ArchiveRecord & { envelope: ArchiveEnvelope; signed_item: string; receipt: Record<string, unknown> | null };
const UPLOAD = 'https://upload.ardrive.io';
const GATEWAY = 'https://turbo-gateway.com';

function archiveService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_STORAGE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, '기록 보관 연결을 확인하고 있어요. 잠시 후 다시 시도해주세요.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function signer() {
  try {
    const jwk = JSON.parse(process.env.ARWEAVE_UPLOAD_JWK ?? '') as JWKInterface;
    if (jwk.kty !== 'RSA' || !jwk.d || !jwk.n) throw new Error('invalid signer');
    return new ArweaveSigner(jwk);
  } catch { throw new HttpError(503, '외부 보관 연결을 준비하고 있어요. 기록 내보내기는 계속 사용할 수 있어요.'); }
}
export function archiveError(message: string): never {
  if (message.includes('ARCHIVE_DAILY_LIMIT')) throw new HttpError(429, '보관 파일은 하루에 세 개까지 만들 수 있어요. 만들어둔 파일은 계속 받을 수 있어요.');
  if (message.includes('ARCHIVE_ATTEMPT_LIMIT')) throw new HttpError(429, '보관 요청이 반복됐어요. 복구 파일을 보관한 뒤 운영자에게 문의해주세요.');
  if (message.includes('ARCHIVE_BUSY')) throw new HttpError(409, '보관 요청을 처리하고 있어요. 잠시 후 상태를 확인해주세요.');
  if (message.includes('ARCHIVE_NOT_FOUND')) throw new HttpError(404, '보관 기록을 찾을 수 없어요.');
  if (message.includes('ARCHIVE_CONFLICT')) throw new HttpError(409, '다른 내용으로 만들어진 보관 파일이에요. 내용을 다시 확인해주세요.');
  if (message.includes('ARCHIVE_ACCOUNT_UNAVAILABLE')) throw new HttpError(409, '계정 정리를 진행 중이라 새 보관을 시작할 수 없어요.');
  throw new HttpError(503, '보관 정보를 저장하지 못했어요. 입력 내용과 복구 파일은 유지돼요.');
}
export async function archiveSnapshot(client: Client, userId: string, options: ArchiveOptions) {
  const source: ArchiveSource = {};
  async function rows(table: string, columns: string, key: keyof ArchiveSource, order = 'created_at') {
    source[key] = await allRows((from, to) => client.from(table).select(columns).eq('user_id', userId).order(order).order('id').range(from, to)) as unknown as Record<string, unknown>[];
  }
  const jobs: Promise<void>[] = [];
  if (options.sections.includes('days') || options.sections.includes('library')) jobs.push(rows('works', 'id,title,kind,status,creator,rating,summary,tags,progress,started_on,finished_on,created_at,updated_at', 'works'));
  if (options.sections.includes('days') || options.sections.includes('notes')) jobs.push(rows('planner_goals', 'id,title,period,status,motivation,target_day,parent_id,metric_unit,metric_target,metric_start_day,created_at,updated_at', 'goals'));
  if (options.sections.includes('days')) {
    jobs.push(rows('daily_tasks', 'id,day,title,status,important,minutes,goal_id,work_id,reason,reason_detail,note,public_note,created_at,updated_at', 'tasks'));
    // Reviews use a day primary key, not a synthetic id.
    for (const [table, columns, key] of [
      ['daily_reviews', 'day,helped,hindered,gained,next_step,document,created_at,updated_at', 'reviews'],
      ['planner_week_reviews', 'day,document,created_at,updated_at', 'weekReviews'],
    ] as const) jobs.push((async () => { source[key] = await allRows((from, to) => client.from(table).select(columns).eq('user_id', userId).gte('day', options.from).lte('day', options.to).order('day').range(from, to)) as unknown as Record<string, unknown>[]; })());
    jobs.push(rows('reading_sessions', 'id,reading_day,status,work_title,task_title,elapsed_seconds,start_page,end_page,memo,started_at,finished_at', 'sessions', 'started_at'));
  }
  if (options.sections.includes('library')) jobs.push(rows('notes', 'id,work_id,content,thought,created_at,updated_at', 'notes'));
  if (options.sections.includes('notes')) {
    jobs.push(rows('quick_memos', 'id,content,created_at,updated_at', 'memos'));
    jobs.push(rows('record_revisits', 'id,source_title,source_text,source_date,source_day,thought,created_at,updated_at', 'revisits'));
  }
  if (options.sections.includes('learning')) {
    jobs.push(rows('learning_resources', 'id,title,url,kind,status,tags,memo,created_at,updated_at', 'resources'));
    jobs.push(rows('resource_bookmarks', 'id,resource_id,seconds,label,created_at', 'bookmarks'));
  }
  await Promise.all(jobs);
  return buildArchiveDocument(options, source);
}
export async function ownArchives(client: Client, userId: string) {
  const result = await client.from('record_archives').select(ARCHIVE_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (result.error) archiveError(result.error.code);
  return result.data as ArchiveRecord[];
}
export async function ownArchive(client: Client, userId: string, id: string) {
  const result = await client.from('record_archives').select(ARCHIVE_COLUMNS + ',envelope,receipt').eq('user_id', userId).eq('id', id).maybeSingle();
  if (result.error) archiveError(result.error.code);
  if (!result.data) throw new HttpError(404, '보관 기록을 찾을 수 없어요.');
  const row = result.data as unknown as Omit<StoredArchive, 'signed_item'>;
  return { ...row, envelope: parseArchiveEnvelope(row.envelope) };
}
export function publicArchive(row: ArchiveRecord): ArchiveRecord {
  return Object.fromEntries(ARCHIVE_COLUMNS.split(',').map(k => [k, row[k as keyof ArchiveRecord]])) as ArchiveRecord;
}
export async function createArchive(userId: string, input: ArchiveOptions & { id: string; envelope: ArchiveEnvelope; counts: ArchiveCounts }) {
  const raw = JSON.stringify(input.envelope), bytes = Buffer.byteLength(raw), digest = createHash('sha256').update(raw).digest('hex');
  if (bytes > MAX_ARCHIVE_BYTES) throw new HttpError(413, '무료 보관 크기를 넘었어요. 기간이나 기록 종류를 줄여주세요.');
  const service = archiveService();
  const old = await service.from('record_archives').select('*').eq('user_id', userId).eq('id', input.id).maybeSingle();
  if (old.error) archiveError(old.error.code);
  if (old.data) {
    if (old.data.digest !== digest || old.data.period_start !== input.from || old.data.period_end !== input.to || JSON.stringify(old.data.sections) !== JSON.stringify(input.sections) || input.sections.some(s => old.data.counts[s] !== input.counts[s])) archiveError('ARCHIVE_CONFLICT');
    return publicArchive(old.data as StoredArchive);
  }
  const key = signer(), item = createData(raw, key, { tags: [{ name: 'Content-Type', value: 'application/octet-stream' }] });
  await item.sign(key);
  const result = await service.rpc('reserve_record_archive', { p_user: userId, p_id: input.id, p_from: input.from, p_to: input.to, p_sections: input.sections, p_counts: input.counts, p_envelope: input.envelope, p_bytes: bytes, p_digest: digest, p_data_id: item.id, p_signed: item.getRaw().toString('base64') });
  if (result.error) archiveError(result.error.message);
  return publicArchive(result.data as StoredArchive);
}
export async function submitArchive(userId: string, id: string) {
  const service = archiveService(), claimed = await service.rpc('claim_record_archive', { p_user: userId, p_id: id });
  if (claimed.error) archiveError(claimed.error.message);
  const row = claimed.data as StoredArchive;
  if (row.state !== 'prepared') return publicArchive(row);
  try {
    const signed = Buffer.from(row.signed_item, 'base64');
    let limits: Record<string, unknown>;
    try {
      const info = await fetch(UPLOAD + '/info', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!info.ok) throw new Error('info unavailable');
      limits = await info.json();
    } catch { throw new HttpError(502, '무료 보관 한도를 확인하지 못했어요. 복구 파일은 그대로 두고 다시 시도해주세요.'); }
    const freeTier = limits.freeTier as { maxItemBytes?: number } | undefined;
    const limit = Number(freeTier?.maxItemBytes ?? limits.freeUploadLimitBytes ?? 0);
    if (!Number.isFinite(limit) || signed.byteLength > limit) throw new HttpError(413, '현재 무료 보관 크기를 넘었어요. 더 짧은 기간으로 보관 파일을 만들어주세요.');
    // Use an unfunded signing wallet and refuse any request that could debit
    // credits. Never top up, authorize x402, or fall back to a paid path.
    try {
      const address = createHash('sha256').update(new DataItem(signed).rawOwner).digest('base64url');
      const [free, balance] = await Promise.all([
        fetch('https://payment.ardrive.io/v1/account/free?address=' + address, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
        fetch('https://payment.ardrive.io/v1/account/balance/arweave?address=' + address, { cache: 'no-store', signal: AbortSignal.timeout(8000) }),
      ]);
      if (!free.ok || ![200, 404].includes(balance.status)) throw new Error('allowance unavailable');
      const allowance = await free.json() as { bytesRemaining?: number | null };
      if (allowance.bytesRemaining !== null && (typeof allowance.bytesRemaining !== 'number' || allowance.bytesRemaining < signed.byteLength)) throw new HttpError(402, '외부 보관 서비스의 무료 한도가 소진됐어요. 복구 파일은 기기에서 계속 열 수 있어요.');
      if (balance.ok) {
        const credits = await balance.json() as { winc?: string; effectiveBalance?: string; receivedApprovals?: unknown[] };
        if (!/^0+$/.test(credits.winc ?? '') || !/^0+$/.test(credits.effectiveBalance ?? '0') || credits.receivedApprovals?.length) throw new HttpError(503, '무료 보관 설정을 확인해야 해요. 결제는 진행하지 않았어요.');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, '무료 보관 잔여량을 확인하지 못했어요. 복구 파일은 그대로 두고 다시 시도해주세요.');
    }
    let response: Response;
    try {
      response = await fetch(UPLOAD + '/v1/tx', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: signed, signal: AbortSignal.timeout(25000) });
    } catch { throw new HttpError(502, '응답을 받지 못했어요. 같은 보관 파일로 다시 시도하면 기존 보관 주소를 사용해요.'); }
    if (response.status === 402) throw new HttpError(402, '외부 서비스의 무료 한도가 소진됐어요. 결제는 진행하지 않았어요. 복구 파일은 기기에서 열 수 있어요.');
    if (response.status === 429) throw new HttpError(429, '외부 보관 요청이 많아요. 잠시 후 같은 파일로 다시 시도해주세요.');
    if (!response.ok) throw new HttpError(502, '외부 보관 요청을 완료하지 못했어요. 복구 파일을 보관한 뒤 다시 시도해주세요.');
    const receipt = await response.json() as Record<string, unknown>;
    if (receipt.id !== row.data_id || receipt.winc !== '0' || typeof receipt.signature !== 'string' || typeof receipt.public !== 'string') throw new HttpError(502, '보관 접수 결과를 확인하지 못했어요. 같은 파일로 상태를 다시 확인해주세요.');
    const updated = await service.from('record_archives').update({ state: 'submitted', receipt, submitted_at: new Date().toISOString(), lease_until: null }).eq('user_id', userId).eq('id', id).eq('state', 'prepared').select(ARCHIVE_COLUMNS).single();
    if (updated.error) archiveError(updated.error.code);
    return publicArchive(updated.data as ArchiveRecord);
  } finally {
    await service.from('record_archives').update({ lease_until: null }).eq('user_id', userId).eq('id', id).eq('state', 'prepared');
  }
}
export async function verifyArchive(client: Client, userId: string, id: string) {
  const row = await ownArchive(client, userId, id);
  if (row.state === 'confirmed' || row.state === 'prepared') return publicArchive(row);
  try {
    const response = await fetch(GATEWAY + '/raw/' + row.data_id, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return publicArchive(row);
    // Never call an upload receipt a chain confirmation. Require both gateway
    // finality flags, matching item identity, and the actual encrypted bytes.
    if (response.headers.get('x-ar-io-data-id') !== row.data_id || response.headers.get('x-ar-io-verified') !== 'true' || response.headers.get('x-ar-io-stable') !== 'true') return publicArchive(row);
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES) return publicArchive(row);
    const raw = await response.arrayBuffer();
    if (raw.byteLength > MAX_ARCHIVE_BYTES || createHash('sha256').update(Buffer.from(raw)).digest('hex') !== row.digest) return publicArchive(row);
    const service = archiveService(), saved = await service.from('record_archives').update({ state: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).eq('state', 'submitted').select(ARCHIVE_COLUMNS).single();
    if (saved.error) archiveError(saved.error.code);
    return publicArchive(saved.data as ArchiveRecord);
  } catch (error) { if (error instanceof HttpError) throw error; return publicArchive(row); }
}
