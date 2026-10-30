import { InputError, object } from './domain.ts';
export function parseWorkSummary(value: unknown): { summary: string; expected_summary: string } {
  const input=object(value);
  if(typeof input.summary!=='string'||input.summary.length>300||input.summary.includes('\u0000'))throw new InputError({summary:'한줄평은 300자 이내로 남겨주세요.'});
  if(typeof input.expected_summary!=='string'||input.expected_summary.length>300||input.expected_summary.includes('\u0000'))throw new InputError({summary:'저장된 한줄평을 다시 확인해주세요.'});
  return {summary:input.summary,expected_summary:input.expected_summary};
}
