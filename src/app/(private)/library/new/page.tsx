import { NewWork } from '@/components/new-work';
export default async function NewPage({searchParams}:{searchParams:Promise<{mode?:string}>}){ const {mode}=await searchParams;return <NewWork manual={mode==='manual'}/>; }
