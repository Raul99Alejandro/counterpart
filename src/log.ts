export interface LogEvent { level: 'info' | 'warn' | 'error'; msg: string; [key: string]: unknown }

type Sink = (line: string) => void;

const stdout: Sink = line => { process.stdout.write(`${line}\n`); };
let sink: Sink = stdout;

/** Una línea JSON por evento en stdout (§7.10). Nunca pases tokens aquí. */
export function log(event: LogEvent): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

/** Para pruebas: captura los logs y devuelve cómo restaurar la salida anterior. */
export function captureLogs(): { lines: () => Array<Record<string, unknown>>; restore: () => void } {
  const captured: string[] = [];
  const previous = sink;
  sink = line => { captured.push(line); };
  return {
    lines: () => captured.map(line => JSON.parse(line) as Record<string, unknown>),
    restore: () => { sink = previous; }
  };
}
