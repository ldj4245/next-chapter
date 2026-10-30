import 'server-only';
import { HttpError } from './api';
export function resourceFailure(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['P0002','23503','42501'].includes(error.code ?? '')) throw new HttpError(404,'자료를 찾을 수 없어요.');
  if (error.code === 'P0001' && error.message === 'RESOURCE_HAS_BOOKMARKS') throw new HttpError(400,'저장한 영상 구간이 있어요. 구간을 정리한 뒤 주소나 종류를 바꿔주세요. 메모는 그대로 남아 있어요.');
  if (error.code === '23505') throw new HttpError(409,'같은 주소의 자료가 이미 있어요. 자료함에서 확인해주세요.');
  if (error.code === 'P0001' && ['RESOURCE_ID_CONFLICT','RESOURCE_REVISION_CONFLICT','BOOKMARK_ID_CONFLICT'].includes(error.message ?? '')) throw new HttpError(409,'다른 곳에서 자료가 바뀌었어요. 작성한 초안은 유지되니 최신 내용을 확인해주세요.');
  if (['23514','22001','22023','23502'].includes(error.code ?? '')) throw new HttpError(400,'자료의 제목·주소·내용을 확인해주세요.');
  throw new Error(error.code ?? 'RESOURCE_FAILED');
}
