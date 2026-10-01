export interface LogEvent { level: 'info' | 'warn' | 'error'; msg: string; [key: string]: unknown }

type Sink = (line: string) => void;

const stdout: Sink = line => { process.stdout.write(`${line}\n`); };
let sink: Sink = stdout;

/** One JSON line per event on stdout (§7.10). Never pass tokens here. */
export function log(event: LogEvent): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

/** For tests: captures the logs and returns a way to restore the previous output. */
export function captureLogs(): { lines: () => Array<Record<string, unknown>>; restore: () => void } {
  const captured: string[] = [];
  const previous = sink;
  sink = line => { captured.push(line); };
  return {
    lines: () => captured.map(line => JSON.parse(line) as Record<string, unknown>),
    restore: () => { sink = previous; }
  };
}
