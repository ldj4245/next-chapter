import { NotesHome } from '@/components/memory';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ organized?: string }> }) {
  const params = await searchParams;
  return <NotesHome organized={params.organized === '1'}/>;
}
