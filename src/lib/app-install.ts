export type InstallPlatform = 'ios' | 'android' | 'other';
export type InstallChoice = 'accepted' | 'dismissed';
export type InstallResult = InstallChoice | 'unavailable' | 'failed';
export type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: InstallChoice }>;
};
export type InstallState = {
  platform: InstallPlatform;
  embedded: boolean;
  installed: boolean;
  snoozed: boolean;
  ready: boolean;
  busy: boolean;
};

const DISMISS_KEY = 'next-chapter:install-dismissed-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_STATE: InstallState = {
  platform: 'other', embedded: false, installed: false,
  snoozed: false, ready: false, busy: false,
};

export function installPlatform(navigator: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(navigator.userAgent) ? 'android' : 'other';
}

export function embeddedBrowser(userAgent: string): boolean {
  return /KAKAOTALK|NAVER\(|DaumApps|Instagram|FBAN|FBAV|Line\/|; wv\)/i.test(userAgent);
}

// Keeps the one-use browser event outside React renders. No records or login
// data are stored; only the date until which the small invitation is dismissed.
export class AppInstallController {
  private state = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private pending: InstallPromptEvent | null = null;
  private browser: Window | null = null;

  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL_STATE;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<InstallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  connect(browser: Window) {
    this.browser = browser;
    const standalone = browser.matchMedia('(display-mode: standalone)');
    const fullscreen = browser.matchMedia('(display-mode: fullscreen)');
    const isInstalled = () => standalone.matches || fullscreen.matches ||
      Boolean((browser.navigator as Navigator & { standalone?: boolean }).standalone);
    const readSnooze = () => {
      try {
        const until = Number(browser.localStorage.getItem(DISMISS_KEY));
        return Number.isFinite(until) && until > Date.now() && until <= Date.now() + SNOOZE_MS;
      } catch { return false; }
    };
    this.update({
      platform: installPlatform(browser.navigator), embedded: embeddedBrowser(browser.navigator.userAgent),
      installed: isInstalled(), snoozed: readSnooze(),
    });
    const onPrompt = (event: Event) => {
      if (this.state.platform === 'other' || this.state.installed) return;
      const prompt = event as InstallPromptEvent;
      if (typeof prompt.prompt !== 'function') return;
      event.preventDefault();
      this.pending = prompt;
      this.update({ ready: true });
    };
    const onInstalled = () => {
      this.pending = null;
      this.update({ installed: true, ready: false });
    };
    const onDisplayChange = () => {
      if (isInstalled()) onInstalled();
      else this.update({ installed: false });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DISMISS_KEY || event.key === null) this.update({ snoozed: readSnooze() });
    };
    browser.addEventListener('beforeinstallprompt', onPrompt);
    browser.addEventListener('appinstalled', onInstalled);
    browser.addEventListener('storage', onStorage);
    standalone.addEventListener('change', onDisplayChange);
    fullscreen.addEventListener('change', onDisplayChange);
    return () => {
      browser.removeEventListener('beforeinstallprompt', onPrompt);
      browser.removeEventListener('appinstalled', onInstalled);
      browser.removeEventListener('storage', onStorage);
      standalone.removeEventListener('change', onDisplayChange);
      fullscreen.removeEventListener('change', onDisplayChange);
      this.browser = null;
    };
  }

  dismiss = () => {
    try { this.browser?.localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS)); }
    catch { /* Private browsing can deny storage; dismissal still works now. */ }
    this.update({ snoozed: true });
  };

  install = async (): Promise<InstallResult> => {
    if (!this.pending || this.state.busy || this.state.installed) return 'unavailable';
    const event = this.pending;
    this.pending = null;
    this.update({ busy: true, ready: false });
    try {
      // Must run in the original tap's user activation, before any await.
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') this.update({ installed: true });
      else this.dismiss();
      return choice.outcome;
    } catch {
      return 'failed';
    } finally {
      this.update({ busy: false });
    }
  };
}
