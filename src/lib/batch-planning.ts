import { InputError,object,uuid } from './domain.ts';
import { parseDay } from './planner.ts';
export function parseBatchPlanning(value:unknown){
  const input=object(value),day=parseDay(input.day),source_day=parseDay(input.source_day);
  if(day<=source_day)throw new InputError({day:'원래 계획보다 뒤의 날짜를 선택해주세요.'});
  if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>50)throw new InputError({ids:'이어갈 할 일을 1~50개 선택해주세요.'});
  return {day,source_day,ids:[...new Set(input.ids.map(uuid))].sort()};
}
