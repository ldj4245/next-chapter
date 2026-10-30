import { CatalogExplorer } from '@/components/catalog';
import type { Kind } from '@/lib/domain';
export default async function DiscoverPage({searchParams}:{searchParams:Promise<{q?:string;kind?:string}>}){
  const {q,kind}=await searchParams;
  const query=typeof q==='string'&&q.trim().length>=2?q.trim().slice(0,100):'';
  const initialKind: Kind = kind==='movie'||kind==='drama' ? kind : 'book';
  return <CatalogExplorer key={initialKind+query} initialQuery={query} initialKind={initialKind}/>;
}
