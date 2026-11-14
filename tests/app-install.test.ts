import assert from 'node:assert/strict';
import test from 'node:test';
import { AppInstallController, embeddedBrowser, installPlatform, type InstallChoice, type InstallPromptEvent } from '../src/lib/app-install.ts';

const DISMISS_KEY = 'next-chapter:install-dismissed-until';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(callback);
    }
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (callback) this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
}

class MediaQuery extends TrackedTarget {
  matches = false;
  change(matches: boolean) { this.matches = matches; this.dispatchEvent(new Event('change')); }
}

function browser(options: { userAgent?: string; platform?: string; maxTouchPoints?: number; standalone?: boolean; deniedStorage?: boolean; storedUntil?: string } = {}) {
  const target = new TrackedTarget();
  const standalone = new MediaQuery(), fullscreen = new MediaQuery();
  const storage = new Map<string, string>();
  if (options.storedUntil !== undefined) storage.set(DISMISS_KEY, options.storedUntil);
  const localStorage = {
    getItem(key: string) { if (options.deniedStorage) throw new Error('Storage denied'); return storage.get(key) ?? null; },
    setItem(key: string, value: string) { if (options.deniedStorage) throw new Error('Storage denied'); storage.set(key, value); },
  };
  Object.assign(target, {
    navigator: { userAgent: options.userAgent ?? 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36', platform: options.platform ?? 'Linux aarch64', maxTouchPoints: options.maxTouchPoints ?? 5, standalone: options.standalone ?? false },
    localStorage,
    matchMedia(query: string) { return query === '(display-mode: standalone)' ? standalone : fullscreen; },
  });
  return { target, window: target as unknown as Window, standalone, fullscreen, storage };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function promptEvent(prompt: () => Promise<unknown> = async () => {}, userChoice: Promise<{ outcome: InstallChoice }> = Promise.resolve({ outcome: 'accepted' })) {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice }) as InstallPromptEvent;
}

test('설치창은 클릭 호출 안에서 즉시 열고 같은 이벤트를 두 번 사용하지 않음', async context => {
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  let inUserActivation = true, calls = 0;
  const choice = deferred<{ outcome: InstallChoice }>();
  const event = promptEvent(async () => { assert.equal(inUserActivation, true); calls++; }, choice.promise);
  device.target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(controller.getSnapshot().ready, true);
  const first = controller.install();
  inUserActivation = false;
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().busy, true);
  assert.equal(await controller.install(), 'unavailable');
  choice.resolve({ outcome: 'accepted' });
  assert.equal(await first, 'accepted');
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(await controller.install(), 'unavailable');
  assert.equal(calls, 1);
});

test('설치를 취소하면 7일간 안내를 숨기고 소비한 이벤트를 재사용하지 않음', async context => {
  context.mock.method(Date, 'now', () => NOW);
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  device.target.dispatchEvent(promptEvent(undefined, Promise.resolve({ outcome: 'dismissed' })));
  assert.equal(await controller.install(), 'dismissed');
  assert.equal(controller.getSnapshot().snoozed, true);
  assert.equal(controller.getSnapshot().installed, false);
  assert.equal(device.storage.get(DISMISS_KEY), String(NOW + WEEK));
  assert.equal(await controller.install(), 'unavailable');
  device.target.dispatchEvent(promptEvent());
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(await controller.install(), 'accepted');
});

test('설치창 실패 뒤 잠금을 풀고 새 브라우저 이벤트가 오면 재시도할 수 있음', async context => {
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  let calls = 0;
  device.target.dispatchEvent(promptEvent(() => { calls++; throw new Error('Native prompt unavailable'); }));
  assert.equal(await controller.install(), 'failed');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(controller.getSnapshot().installed, false);
  assert.equal(await controller.install(), 'unavailable');
  device.target.dispatchEvent(promptEvent(async () => { calls++; }));
  assert.equal(await controller.install(), 'accepted');
  assert.equal(calls, 2);
});

test('설치 결과 확인 실패도 새 이벤트가 오기 전에는 재시도하지 않음', async context => {
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  const choice = deferred<{ outcome: InstallChoice }>();
  device.target.dispatchEvent(promptEvent(undefined, choice.promise));
  const result = controller.install();
  await Promise.resolve();
  choice.reject(new Error('Choice unavailable'));
  assert.equal(await result, 'failed');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(await controller.install(), 'unavailable');
});

test('아이폰과 데스크톱 모드 아이패드를 iOS로 인식하고 내부 브라우저를 구분', () => {
  assert.equal(installPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), 'ios');
  assert.equal(installPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
  assert.equal(installPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0 }), 'other');
  assert.equal(installPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux aarch64', maxTouchPoints: 5 }), 'android');
  for (const agent of ['KAKAOTALK/26.1', 'NAVER(inapp; search)', 'DaumApps/7', 'Instagram 400', 'FBAN/FBIOS;FBAV/1', 'Line/14.0', 'Mozilla/5.0 (Linux; Android 15; wv)']) assert.equal(embeddedBrowser(agent), true, agent);
  assert.equal(embeddedBrowser('Mozilla/5.0 (iPhone) CriOS/140 Mobile Safari/604.1'), false);
  assert.equal(embeddedBrowser('Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36'), false);
});

test('iOS 홈 화면 실행과 standalone·fullscreen 전환에서는 설치 안내를 숨김', async context => {
  const ios = browser({ userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', standalone: true });
  const iosController = new AppInstallController();
  context.after(iosController.connect(ios.window));
  assert.equal(iosController.getSnapshot().installed, true);
  const ignored = promptEvent();
  ios.target.dispatchEvent(ignored);
  assert.equal(ignored.defaultPrevented, false);
  assert.equal(await iosController.install(), 'unavailable');
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  device.target.dispatchEvent(promptEvent());
  device.standalone.change(true);
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(controller.getSnapshot().ready, false);
  device.standalone.change(false);
  assert.equal(controller.getSnapshot().installed, false);
  device.fullscreen.change(true);
  assert.equal(controller.getSnapshot().installed, true);
  device.fullscreen.change(false);
  assert.equal(controller.getSnapshot().installed, false);
  device.target.dispatchEvent(promptEvent());
  device.target.dispatchEvent(new Event('appinstalled'));
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(controller.getSnapshot().ready, false);
});

test('데스크톱에서는 모바일 설치 이벤트를 가로채지 않음', context => {
  const device = browser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  const event = promptEvent();
  device.target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(controller.getSnapshot().ready, false);
});

test('저장된 숨김 기한을 읽으며 만료되었거나 잘못된 기한은 무시', context => {
  context.mock.method(Date, 'now', () => NOW);
  for (const [storedUntil, expected] of [[String(NOW + WEEK), true], [String(NOW + 1), true], [String(NOW), false], [String(NOW - 1), false], [String(NOW + WEEK + 1), false], ['Infinity', false], ['bad', false]] as const) {
    const device = browser({ storedUntil }), controller = new AppInstallController();
    context.after(controller.connect(device.window));
    assert.equal(controller.getSnapshot().snoozed, expected, storedUntil);
  }
});

test('다른 탭의 숨김 기한 변경을 반영하고 저장소가 막혀도 현재 안내는 닫힘', context => {
  context.mock.method(Date, 'now', () => NOW);
  const device = browser(), controller = new AppInstallController();
  context.after(controller.connect(device.window));
  device.storage.set(DISMISS_KEY, String(NOW + WEEK));
  device.target.dispatchEvent(Object.assign(new Event('storage'), { key: DISMISS_KEY }));
  assert.equal(controller.getSnapshot().snoozed, true);
  device.storage.clear();
  device.target.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
  assert.equal(controller.getSnapshot().snoozed, false);
  const denied = browser({ deniedStorage: true }), deniedController = new AppInstallController();
  context.after(deniedController.connect(denied.window));
  assert.equal(deniedController.getSnapshot().snoozed, false);
  assert.doesNotThrow(() => deniedController.dismiss());
  assert.equal(deniedController.getSnapshot().snoozed, true);
});

test('연결 해제 시 브라우저·화면 모드 리스너와 구독을 정리', () => {
  const device = browser(), controller = new AppInstallController();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => notifications++);
  const disconnect = controller.connect(device.window);
  assert.equal(device.target.listenerCount(), 3);
  assert.equal(device.standalone.listenerCount(), 1);
  assert.equal(device.fullscreen.listenerCount(), 1);
  const beforeDisconnect = notifications;
  disconnect();
  assert.equal(device.target.listenerCount(), 0);
  assert.equal(device.standalone.listenerCount(), 0);
  assert.equal(device.fullscreen.listenerCount(), 0);
  device.target.dispatchEvent(promptEvent());
  device.target.dispatchEvent(new Event('appinstalled'));
  device.standalone.change(true);
  assert.equal(notifications, beforeDisconnect);
  unsubscribe();
  controller.dismiss();
  assert.equal(notifications, beforeDisconnect);
});
