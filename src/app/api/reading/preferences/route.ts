import { assertOrigin, failure, HttpError, json, readBody, requireSession } from '@/lib/api';
import { parsePreferences, preferenceColumns } from '@/lib/reading';
export async function PATCH(request: Request) {
  try {
    assertOrigin(request);
    const { user, client } = await requireSession(), input = parsePreferences(await readBody(request));
    if (input.work_id) {
      const book = await client.from('works').select('id').eq('id', input.work_id).eq('user_id', user.id).eq('kind', 'book').in('status', ['planned', 'active']).maybeSingle();
      if (book.error) throw new Error(book.error.code);
      if (!book.data) throw new HttpError(404, '예정 또는 감상 중인 내 책을 선택해주세요.');
    }
    const result = await client.from('reading_preferences').upsert({ ...input, user_id: user.id }).select(preferenceColumns).single();
    if (result.error) throw new Error(result.error.code);
    return json({ preferences: result.data });
  } catch (error) { return failure(error); }
}
