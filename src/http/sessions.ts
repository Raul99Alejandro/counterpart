import type { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';

export interface SessionEntry {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  businessId: string;
  lastSeen: number;
}

export class Sessions {
  private entries = new Map<string, SessionEntry>();

  /** Devuelve la sesión solo si pertenece al negocio del token. */
  get(sessionId: string, businessId: string): SessionEntry | null {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.businessId !== businessId) return null;
    return entry;
  }

  set(sessionId: string, entry: SessionEntry): void {
    this.entries.set(sessionId, entry);
  }

  drop(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.entries.delete(sessionId);
    // try/catch: en tests, transport/server pueden ser dobles sin close() real.
    try { entry.transport.close().catch(() => {}); } catch { /* ignorar */ }
    try { entry.server.close().catch(() => {}); } catch { /* ignorar */ }
  }

  touch(sessionId: string, now: number): void {
    const entry = this.entries.get(sessionId);
    if (entry) entry.lastSeen = now;
  }

  sweep(now: number, idleMs: number): void {
    for (const [sessionId, entry] of this.entries) {
      if (now - entry.lastSeen > idleMs) this.drop(sessionId);
    }
  }

  closeAll(): void {
    for (const sessionId of [...this.entries.keys()]) this.drop(sessionId);
  }
}
