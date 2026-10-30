import { failure, json, requireSession } from '@/lib/api';
import { parseDay } from '@/lib/planner';
import { partnerFailure } from '@/lib/partner-server';

export async function GET(request: Request) {
  try {
    const day = parseDay(new URL(request.url).searchParams.get('day'));
    const { client } = await requireSession(), result = await client.rpc('partner_day', { p_day: day });
    partnerFailure(result.error);
    return json(result.data);
  } catch (error) { return failure(error); }
}
