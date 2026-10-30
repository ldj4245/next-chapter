import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsedSeconds, parsePreferences, parseReadingDetails, readingDay, readingWeek, remainingClock, reminderCalendar, type ReadingSession } from '../src/lib/reading.ts';

test('독서 날짜·주간 달력은 한국 자정과 월요일을 기준으로 계산', () => {
  assert.equal(readingDay('2026-10-08T14:59:59Z'), '2026-10-08');
  assert.equal(readingDay('2026-10-08T15:00:00Z'), '2026-10-09');
  assert.deepEqual(readingWeek('2026-10-11'), ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
  assert.equal(readingWeek('2026-01-01')[0], '2025-12-29');
  assert.equal(readingWeek('2026-10-12')[0], '2026-10-12');
});
test('타이머는 서버 시각으로 경과를 복원하고 멈춘 시간은 더하지 않음', () => {
  const session = { elapsed_seconds: 20, running_since: '2026-10-09T12:00:00Z' } as ReadingSession;
  assert.equal(elapsedSeconds(session, Date.parse('2026-10-09T12:02:00Z')), 140);
  assert.equal(elapsedSeconds({ ...session, running_since: null }, Date.parse('2026-10-10T12:00:00Z')), 20);
  assert.equal(elapsedSeconds(session, Date.parse('2026-10-09T11:59:00Z')), 20);
  assert.equal(remainingClock(0), '05:00'); assert.equal(remainingClock(299), '00:01'); assert.equal(remainingClock(700), '00:00');
});
test('완료에는 추가 입력이 필요 없으며 선택 입력도 범위·형식을 검사', () => {
  assert.deepEqual(parseReadingDetails({}), { progress: null, content: null, thought: null });
  assert.deepEqual(parseReadingDetails({ progress: '42', content: ' 문장 ', thought: ' 생각 ' }), { progress: 42, content: '문장', thought: '생각' });
  for (const progress of [-1, 1.2, true, {}, 'NaN', 2147483648]) assert.throws(() => parseReadingDetails({ progress }));
  assert.throws(() => parseReadingDetails({ content: ' ', thought: '생각' }));
  assert.throws(() => parseReadingDetails({ content: '', thought: '생각' }));
  assert.throws(() => parseReadingDetails({ content: 'a'.repeat(20001) }));
});
test('루틴 설정·캘린더 알림은 시간 검증 및 한국 시간으로 다음 일정을 생성', () => {
  assert.deepEqual(parsePreferences({ cue: ' 자기 전에 ', reminder_time: '22:00' }), { cue: '자기 전에', reminder_time: '22:00', work_id: null });
  for (const reminder_time of ['24:00', '9:00', '22:61', '22:00\r\nSUMMARY:bad']) assert.throws(() => parsePreferences({ cue: '아침', reminder_time }));
  assert.throws(() => parsePreferences({ cue: ' ', reminder_time: '22:00' }));
  const calendar = reminderCalendar('22:00', new Date('2026-12-31T13:01:00Z'));
  assert.ok(calendar.includes('DTSTART;TZID=Asia/Seoul:20270101T220000\r\n'));
  assert.ok(calendar.includes('RRULE:FREQ=DAILY')); assert.ok(calendar.includes('BEGIN:VALARM'));
  assert.ok(!calendar.includes('work_title')); assert.ok(calendar.endsWith('END:VCALENDAR\r\n'));
});
