import { RevisitHome } from '@/components/memory';

export default async function RevisitPage({ searchParams }: { searchParams: Promise<{ entry?: string }> }) {
  const params = await searchParams;
  return <RevisitHome entry={params.entry}/>;
}
