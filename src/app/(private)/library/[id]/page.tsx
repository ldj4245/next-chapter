import { notFound } from 'next/navigation';
import { WorkDetail } from '@/components/detail';
import { uuid } from '@/lib/domain';
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; try { uuid(id); } catch { notFound(); } return <WorkDetail id={id}/>;
}
