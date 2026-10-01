/**
 * Fixed-window counters for the public demo. In memory: the service runs one task, and a restart
 * only resets the windows early. The daily turn cap bounds the Nova spend (about $0.0027 a turn), and the
 * speech cap the Polly spend (a reply is about 120 characters).
 */
export interface DemoLimitConfig {
  sandboxesPerIpPerHour: number;
  sandboxesPerDay: number;
  turnsPerSandboxPerDay: number;
  turnsPerDay: number;
  speechPerSandboxPerDay: number;
  speechPerDay: number;
}

export const DEFAULT_DEMO_LIMITS: DemoLimitConfig = {
  sandboxesPerIpPerHour: 5, sandboxesPerDay: 100, turnsPerSandboxPerDay: 80, turnsPerDay: 400,
  speechPerSandboxPerDay: 160, speechPerDay: 800
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

class Windows {
  private counts = new Map<string, { window: number; count: number }>();
  constructor(private readonly size: number) {}

  /** Current count for `key` in the window that contains `now`. */
  count(key: string, now: number): number {
    const entry = this.counts.get(key);
    return entry && entry.window === Math.floor(now / this.size) ? entry.count : 0;
  }

  add(key: string, now: number): void {
    const window = Math.floor(now / this.size);
    const entry = this.counts.get(key);
    this.counts.set(key, { window, count: entry && entry.window === window ? entry.count + 1 : 1 });
    if (this.counts.size > 10_000) this.prune(window);
  }

  private prune(window: number): void {
    for (const [key, entry] of this.counts) if (entry.window !== window) this.counts.delete(key);
  }
}

export class DemoLimits {
  private readonly perIp = new Windows(HOUR);
  private readonly daily = new Windows(DAY);

  constructor(private readonly config: DemoLimitConfig = DEFAULT_DEMO_LIMITS) {}

  /** Takes one sandbox for `ip` if both its hourly and the global daily cap allow it. */
  takeSandbox(ip: string, now: number = Date.now()): boolean {
    if (this.perIp.count(ip, now) >= this.config.sandboxesPerIpPerHour) return false;
    if (this.daily.count('sandboxes', now) >= this.config.sandboxesPerDay) return false;
    this.perIp.add(ip, now);
    this.daily.add('sandboxes', now);
    return true;
  }

  /** Takes one agent turn for a sandbox if its own and the global daily cap allow it. */
  takeTurn(sandboxId: string, now: number = Date.now()): boolean {
    if (this.daily.count(`turns:${sandboxId}`, now) >= this.config.turnsPerSandboxPerDay) return false;
    if (this.daily.count('turns', now) >= this.config.turnsPerDay) return false;
    this.daily.add(`turns:${sandboxId}`, now);
    this.daily.add('turns', now);
    return true;
  }

  /** Takes one spoken reply for a sandbox. Replaying a reply speaks it again, so this is apart from turns. */
  takeSpeech(sandboxId: string, now: number = Date.now()): boolean {
    if (this.daily.count(`speech:${sandboxId}`, now) >= this.config.speechPerSandboxPerDay) return false;
    if (this.daily.count('speech', now) >= this.config.speechPerDay) return false;
    this.daily.add(`speech:${sandboxId}`, now);
    this.daily.add('speech', now);
    return true;
  }
}
