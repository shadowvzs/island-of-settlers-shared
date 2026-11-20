/**
 * Min-heap of script-clock wake-ups `(tick, runId)` for `wait` steps and timeouts (design §6.5): no per-tick scan
 * of waiting runs. Derived data: rebuilt from the saved runs on load; stale entries are skipped by the caller.
 */
export class WakeQueue {
  private readonly ticks: number[] = [];
  private readonly runIds: number[] = [];

  get size() {
    return this.ticks.length;
  }

  clear() {
    this.ticks.length = 0;
    this.runIds.length = 0;
  }

  push(tick: number, runId: number) {
    this.ticks.push(tick);
    this.runIds.push(runId);
    this.siftUp(this.ticks.length - 1);
  }

  /** Removes and returns the run id of the earliest entry due at `tick`, or null. */
  popDue(tick: number): { runId: number; tick: number } | null {
    if (this.ticks.length === 0 || this.ticks[0]! > tick) return null;
    const entry = { runId: this.runIds[0]!, tick: this.ticks[0]! };
    const lastTick = this.ticks.pop()!;
    const lastRun = this.runIds.pop()!;
    if (this.ticks.length > 0) {
      this.ticks[0] = lastTick;
      this.runIds[0] = lastRun;
      this.siftDown(0);
    }
    return entry;
  }

  private before(a: number, b: number) {
    return this.ticks[a]! < this.ticks[b]! || (this.ticks[a] === this.ticks[b] && this.runIds[a]! < this.runIds[b]!);
  }

  private swap(a: number, b: number) {
    [this.ticks[a], this.ticks[b]] = [this.ticks[b]!, this.ticks[a]!];
    [this.runIds[a], this.runIds[b]] = [this.runIds[b]!, this.runIds[a]!];
  }

  private siftUp(start: number) {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(index, parent)) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(start: number) {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.ticks.length && this.before(left, smallest)) smallest = left;
      if (right < this.ticks.length && this.before(right, smallest)) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }
}
