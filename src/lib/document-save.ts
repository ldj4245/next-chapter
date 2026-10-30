export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type SaveReport = { status: SaveState; error: string; dirty: boolean };

/** Serialize writes and coalesce edits made while a request is in flight. */
export class DocumentSaver<T> {
  private value: T;
  private baseline: string;
  private enabled = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<boolean> | null = null;
  private disposed = false;
  private quiet = false;
  private successful = false;
  private failed = false;
  private failure = '';
  private writing: string | null = null;
  private uncertain = false;
  private persist: (value: T) => Promise<void>;
  private report: (state: SaveReport) => void;
  private delay: number;
  constructor(initial: T, persist: (value: T) => Promise<void>, report: (state: SaveReport) => void, delay = 800) {
    this.value = initial;
    this.baseline = JSON.stringify(initial);
    this.persist = persist; this.report = report; this.delay = delay;
  }
  private get dirty() { const key = JSON.stringify(this.value); return this.uncertain || key !== this.baseline || (this.writing !== null && key !== this.writing); }
  private emit(status: SaveState, error = '') {
    if (!this.disposed && !this.quiet) this.report({ status, error, dirty: this.dirty });
  }
  private cancelTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  update(value: T, enabled = true) {
    const changed = JSON.stringify(value) !== JSON.stringify(this.value), wasEnabled = this.enabled;
    this.value = value; this.enabled = enabled; this.cancelTimer();
    if (this.disposed) return;
    if (!this.dirty) { this.emit(this.running ? 'saving' : this.successful ? 'saved' : 'idle'); return; }
    if (this.running) { this.emit('saving'); return; }
    if (this.failed && !changed && wasEnabled === enabled) { this.emit('error', this.failure); return; }
    this.failed = false; this.failure = ''; this.emit('pending');
    if (enabled) this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay);
  }
  flush(): Promise<boolean> {
    this.cancelTimer();
    if (this.running) return this.running;
    if (this.disposed || !this.enabled) return Promise.resolve(!this.dirty);
    if (!this.dirty) return Promise.resolve(true);
    this.failed = false; this.failure = '';
    const work = async () => {
      while (!this.disposed && this.enabled && this.dirty) {
        const key = JSON.stringify(this.value), snapshot = JSON.parse(key) as T;
        this.writing = key;
        this.emit('saving');
        try { await this.persist(snapshot); }
        catch (error) {
          this.writing = null; this.uncertain = true;
          this.failed = true; this.failure = error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해주세요.';
          this.emit('error', this.failure); return false;
        }
        this.baseline = key; this.writing = null; this.uncertain = false; this.successful = true;
      }
      this.emit(this.dirty ? 'pending' : 'saved'); return !this.dirty;
    };
    this.running = work().finally(() => { this.running = null; });
    return this.running;
  }
  acknowledge(value: T) {
    this.cancelTimer(); this.value = value; this.baseline = JSON.stringify(value);
    this.successful = true; this.failed = false; this.failure = ''; this.uncertain = false; this.emit('saved');
  }
  /** Finish the latest draft on client-side history changes without updating an unmounted editor. */
  close() { this.quiet = true; this.cancelTimer(); void this.flush().finally(() => this.dispose()); }
  dispose() { this.disposed = true; this.cancelTimer(); }
}
