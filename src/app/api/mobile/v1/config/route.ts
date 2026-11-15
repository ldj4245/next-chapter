import { failure, json } from '@/lib/api';
import { mobileConfiguration } from '@/lib/mobile-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { return json(mobileConfiguration()); }
  catch (error) { return failure(error); }
}
