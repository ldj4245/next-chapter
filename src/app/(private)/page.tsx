import { DailyPlanner } from '@/components/planner';
import { plannerDay } from '@/lib/planner';
export default async function HomePage({searchParams}: {searchParams:Promise<{day?:string;goal?:string;view?:string}>}) {
  const params=await searchParams;
  return <DailyPlanner day={params.day??plannerDay()} goalId={params.goal} initialView={params.view==='peer'?'peer':'mine'}/>;
}
