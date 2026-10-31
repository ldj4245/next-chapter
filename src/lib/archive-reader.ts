import { type ArchiveKit } from './archive.ts';
import { base64 } from './archive-crypto.ts';

const STYLE = `:root{color-scheme:light;--ink:#30332e;--muted:#6e736a;--line:#dfe1d9;--green:#526347}*{box-sizing:border-box}body{margin:0;background:#f7f7f4;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.8;word-break:keep-all}main{max-width:800px;margin:0 auto;padding:52px 28px 80px}header{border-bottom:1px solid var(--line);padding-bottom:25px;margin-bottom:28px}.brand{font-size:13px;letter-spacing:.03em;color:var(--muted)}h1{font-size:30px;font-weight:600;letter-spacing:-.05em;margin:12px 0 8px}h2{font-size:19px;font-weight:600;margin:0 0 16px}p{margin:8px 0}button,input{font:inherit}button{min-height:44px;padding:9px 14px;border:1px solid var(--line);border-radius:5px;background:#fff;color:var(--ink);cursor:pointer}button.primary{background:var(--green);color:#fff;border-color:var(--green)}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--green);outline-offset:3px}.actions{display:flex;gap:9px;flex-wrap:wrap;margin:20px 0}small,.muted{font-size:13px;color:var(--muted)}#status{min-height:26px;font-size:13px;margin:12px 0;overflow-wrap:anywhere}#status.error{color:#a33232}details{border-top:1px solid var(--line);padding:14px 0}summary{cursor:pointer;min-height:36px;font-size:14px}label{display:block;margin:12px 0 6px;font-size:13px;color:var(--muted)}input{display:block;width:100%;min-width:0;min-height:46px;padding:9px 11px;border:1px solid var(--line);border-radius:4px;background:#fff;color:var(--ink);font-size:16px}.key-row{display:flex;gap:8px}.key-row input{flex:1}.key-row button{flex:none}#results{margin-top:36px}#filters{display:flex;flex-wrap:wrap;gap:5px;margin:14px 0 22px}#filters button{border:0;background:none;font-size:13px;padding:6px 10px}#filters button[aria-pressed=true]{background:#e8ecdf;color:#405037}article{padding:23px 0;border-top:1px solid var(--line)}article h3{font-size:18px;font-weight:550;margin:5px 0 15px;overflow-wrap:anywhere}.entry-meta{font-size:12px;color:var(--muted)}dl{margin:0}dt{font-size:12px;color:var(--muted);margin-top:14px}dd{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.block{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere}.quote{border-left:2px solid var(--line);padding-left:15px;color:var(--muted)}article h4{font-size:19px;margin:18px 0 8px}article h5{font-size:16px;margin:16px 0 6px}footer{border-top:1px solid var(--line);margin-top:40px;padding-top:20px;color:var(--muted);font-size:12px}[hidden]{display:none!important}@media(max-width:480px){main{padding:30px 20px 60px}h1{font-size:26px}.actions>button{flex:1 1 auto}}`;

// This reader ships with the file. It contains no remote scripts, fonts, login
// calls, analytics, or dependency on the application's domain.
export const ARCHIVE_READER_SCRIPT = `
const kit=JSON.parse(document.getElementById('recovery').textContent);
const $=id=>document.getElementById(id);
const labels={days:'하루 기록',library:'서재',notes:'목표와 메모',learning:'학습 자료'};
let records=null,section='';
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;}
async function digest(e){const bytes=new TextEncoder().encode(JSON.stringify({format:e.format,version:e.version,cipher:e.cipher,compression:e.compression,iv:e.iv,ciphertext:e.ciphertext}));const h=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,'0')).join('');}
async function decrypt(envelope,keyText){
 if(!globalThis.crypto?.subtle)throw Error('이 브라우저에서 복구 기능을 사용할 수 없어요. 최신 브라우저에서 이 파일을 열어주세요.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(keyText))throw Error('복구키를 확인해주세요.');
 if(envelope.format!=='next-chapter-encrypted'||envelope.version!==1||envelope.cipher!=='AES-256-GCM'||!['gzip','none'].includes(envelope.compression))throw Error('지원하지 않는 보관 형식이에요.');
 const key=await crypto.subtle.importKey('raw',decode(keyText),'AES-GCM',false,['decrypt']);
 let raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv),additionalData:new TextEncoder().encode('next-chapter-record-archive:1:'+envelope.compression)},key,decode(envelope.ciphertext));
 if(envelope.compression==='gzip'){if(typeof DecompressionStream==='undefined')throw Error('최신 브라우저에서 이 파일을 열어주세요.');raw=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(data.format!=='next-chapter-records'||data.version!==1||!Array.isArray(data.entries))throw Error('지원하지 않는 기록 형식이에요.');
 return data;
}
function render(){
 const query=$('search').value.trim().toLocaleLowerCase();const list=$('entries');list.replaceChildren();
 const selected=records.entries.filter(e=>(!section||e.section===section)&&(!query||JSON.stringify(e).toLocaleLowerCase().includes(query)));
 $('count').textContent=selected.length+'개의 기록';
 for(const e of selected){
  const article=node('article');article.append(node('div',e.date+' · '+e.kind,'entry-meta'),node('h3',e.title));
  const dl=node('dl');for(const f of e.fields||[])dl.append(node('dt',f.label),node('dd',f.text));article.append(dl);
  for(const b of e.blocks||[]){const tags={heading1:'h4',heading2:'h5'};const prefix=b.kind==='check'?(b.checked?'☑ ':'☐ '):b.kind==='bullet'?'• ':b.kind==='numbered'?'— ':'';article.append(node(tags[b.kind]||'p',prefix+b.text,'block'+(b.kind==='quote'?' quote':'')));}
  list.append(article);
 }
 if(!selected.length)list.append(node('p','조건에 맞는 기록이 없어요.','muted'));
}
async function openRecords(envelope){
 if(kit.digest&&await digest(envelope)!==kit.digest)throw Error('보관 파일의 내용이 달라졌어요. 원래 복구 파일을 확인해주세요.');
 records=await decrypt(envelope,$('key').value.trim());
 $('period').textContent=records.period.from+' — '+records.period.to;
 $('results').hidden=false;$('export').hidden=false;
 const filters=$('filters');filters.replaceChildren();
 for(const [value,label]of [['','전체'],...records.sections.map(s=>[s,labels[s]||s])]){const b=node('button',label);b.type='button';b.setAttribute('aria-pressed',String(value===section));b.onclick=()=>{section=value;for(const child of filters.children)child.setAttribute('aria-pressed',String(child===b));render();};filters.append(b);}
 render();status('이 파일에 담긴 기록을 열었어요. 로그인과 인터넷 연결은 필요하지 않아요.');
}
$('key').value=kit.key||'';
$('address').value=kit.dataId?'https://arweave.net/'+kit.dataId:'';
$('remote').disabled=!kit.dataId;
$('toggle-key').onclick=()=>{const shown=$('key').type==='text';$('key').type=shown?'password':'text';$('toggle-key').textContent=shown?'보기':'숨기기';};
$('open').onclick=async()=>{try{status('기록을 여는 중…');await openRecords(kit.envelope);}catch(e){status(e.name==='OperationError'?'복구키가 맞지 않거나 파일이 손상됐어요.':e.message,true);}};
$('search').oninput=()=>{if(records)render();};
$('export').onclick=()=>{if(!records)return;const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='next-chapter-'+records.period.from+'-'+records.period.to+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('remote').onclick=async()=>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(kit.dataId||''))return;
 $('remote').disabled=true;status('네트워크에서 보관본을 가져오는 중…');
 try{let envelope;for(const base of ['https://turbo-gateway.com/raw/','https://arweave.net/']){try{const response=await fetch(base+kit.dataId,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});if(!response.ok)continue;const text=await response.text();if(text.length>100000)continue;const value=JSON.parse(text);if(await digest(value)!==kit.digest)continue;envelope=value;break;}catch{}}
  if(!envelope)throw Error('지금은 보관본을 가져오지 못했어요. 이 파일에 담긴 기록은 계속 열 수 있어요.');
  await openRecords(envelope);status('네트워크에서 받은 보관본이 이 파일과 일치해요. 기록을 열었어요.');
 }catch(e){status(e.message,true);}finally{$('remote').disabled=false;}
};
`;

async function cspHash(text: string) {
  return 'sha256-' + base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}
export async function recoveryHTML(kit: ArchiveKit): Promise<string> {
  const payload = JSON.stringify(kit).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const [scriptHash, styleHash] = await Promise.all([cspHash(ARCHIVE_READER_SCRIPT), cspHash(STYLE)]);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src '${scriptHash}'; style-src '${styleHash}'; connect-src https://turbo-gateway.com https://arweave.net; base-uri 'none'; form-action 'none'"><title>다음 장 · 내 기록</title><style>${STYLE}</style></head><body><main><header><span class="brand">다음 장 / 내 기록 보관함</span><h1>남겨둔 기록</h1><p id="period" class="muted">이 파일을 브라우저에서 열면 기록을 읽을 수 있어요.</p></header><p>복구키와 암호화된 기록이 함께 들어 있는 개인 파일입니다.<br>이 파일을 가진 사람은 기록을 읽을 수 있으니 안전한 곳에 보관해주세요.</p><div class="actions"><button id="open" class="primary" type="button">기록 열기</button><button id="export" type="button" hidden>기록 JSON 저장</button></div><p id="status" role="status" aria-live="polite"></p><details><summary>보관 주소와 복구키</summary><label for="address">Arweave 보관 주소</label><input id="address" readonly aria-label="Arweave 보관 주소"><label for="key">복구키</label><div class="key-row"><input id="key" type="password" autocomplete="off" spellcheck="false"><button id="toggle-key" type="button">보기</button></div><div class="actions"><button id="remote" type="button">네트워크에서 보관본 다시 받기</button></div><p class="muted">보관 주소가 있어도 아직 업로드를 실행하지 않았거나 처리 중이면 가져오지 못할 수 있어요. 파일 안의 기록은 인터넷 없이도 열 수 있어요.</p></details><section id="results" hidden><h2>보관한 내용</h2><label for="search">기록에서 찾기</label><input id="search" type="search" placeholder="제목이나 내용 검색"><nav id="filters" aria-label="기록 종류"></nav><p id="count" class="muted"></p><div id="entries"></div></section><footer>이 뷰어는 다음 장 계정이나 서버 없이 작동합니다. 기록을 열 때 외부로 전송하지 않습니다. 네트워크에서 다시 받기를 누르면 Arweave 게이트웨이에 요청합니다.</footer></main><script id="recovery" type="application/json">${payload}</script><script>${ARCHIVE_READER_SCRIPT}</script></body></html>`;
}
