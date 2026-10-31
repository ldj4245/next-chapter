import { assertOrigin, failure, json, readBody } from '@/lib/api';
import { requireAccountSession } from '@/lib/account-server';
import { parseArchiveOptions } from '@/lib/archive';
import { archiveSnapshot } from '@/lib/archive-server';

export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireAccountSession();
    return json({ document: await archiveSnapshot(client, user.id, parseArchiveOptions(await readBody(request))) });
  } catch (error) { return failure(error); }
}
