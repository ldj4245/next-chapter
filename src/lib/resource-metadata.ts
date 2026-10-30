import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { canonicalResourceURL, guessResourceKind, resourceHost } from './resources.ts';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  const [a,b] = address.toLowerCase().split(':').map(part => parseInt(part || '0',16));
  return a >= 0x2000 && a <= 0x3ffe && a !== 0x2002 && !(a === 0x2001 && (b < 0x200 || b === 0xdb8));
}
function clean(value: string): string {
  const names: Record<string,string> = { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ' };
  return value.replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_, entity: string) => {
    if (entity[0] !== '#') return names[entity.toLowerCase()] ?? '';
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
  }).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}
export function resourceHTMLTitle(html: string): string {
  const head = html.split(/<\/head\s*>/i)[0];
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string,string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs.set(match[1].toLowerCase(),match[2] ?? match[3] ?? match[4]);
    if (['og:title','twitter:title'].includes((attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase()) && attrs.get('content')) return clean(attrs.get('content')!).slice(0,200);
  }
  return clean(head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '').slice(0,200);
}

// Resolve each redirect separately, reject mixed private/public answers, and pin
// the validated IP on the real socket to prevent DNS rebinding. No browser data
// or cookies are forwarded. Metadata failure never prevents saving the URL.
async function htmlAt(value: string, signal: AbortSignal, redirects = 0): Promise<string> {
  const url = new URL(canonicalResourceURL(value));
  const addresses = await Promise.race([lookup(url.hostname,{all:true,verbatim:true}), new Promise<never>((_,reject) => signal.addEventListener('abort',() => reject(new Error('METADATA_TIMEOUT')),{once:true}))]);
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('METADATA_ADDRESS');
  if (signal.aborted) throw new Error('METADATA_TIMEOUT');
  const pinned: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null,addresses);
    else { const item = addresses.find(item => item.family === 4) ?? addresses[0]; callback(null,item.address,item.family); }
  };
  return new Promise((resolve,reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url,{
      method:'GET',lookup:pinned,agent:false,signal,
      headers:{'User-Agent':'NextChapter-LinkPreview/1.0','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
    },response => {
      const code = response.statusCode ?? 0;
      if ([301,302,303,307,308].includes(code) && response.headers.location) {
        response.destroy();
        if (redirects >= 2) { reject(new Error('METADATA_REDIRECT')); return; }
        let next: string; try { next = canonicalResourceURL(new URL(response.headers.location,url).href); } catch { reject(new Error('METADATA_REDIRECT')); return; }
        void htmlAt(next,signal,redirects+1).then(resolve,reject); return;
      }
      if (code !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] ?? '') ||
          !['','identity'].includes(response.headers['content-encoding'] ?? '')) { response.destroy(); reject(new Error('METADATA_CONTENT')); return; }
      const chunks: Buffer[] = []; let size = 0, done = false;
      response.on('data',(chunk: Buffer) => {
        if (done) return;
        size += chunk.length; chunks.push(chunk);
        const text = Buffer.concat(chunks).subarray(0,196608).toString('utf8');
        if (size >= 196608 || /<\/head\s*>/i.test(text)) { done = true; resolve(text); response.destroy(); }
      });
      response.on('end',() => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
      response.on('error',error => { if (!done) reject(error); });
      response.on('close',() => { if (!done) { done = true; reject(new Error('METADATA_CLOSED')); } });
    });
    request.on('error',reject); request.end();
  });
}
export async function resourceMetadata(value: unknown) {
  const url = canonicalResourceURL(value), fallback = resourceHost(url);
  try { const title = resourceHTMLTitle(await htmlAt(url,AbortSignal.timeout(3500))); return {url,title:title || fallback,kind:guessResourceKind(url),found:Boolean(title)}; }
  catch { return {url,title:fallback,kind:guessResourceKind(url),found:false}; }
}
