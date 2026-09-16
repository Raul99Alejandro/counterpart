import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import type { Express, Request, Response } from 'express';
import { loadProfile } from '../profiles/load.js';
import { registerTools, type ToolContext } from '../tools/context.js';
import type { Store } from '../store/store.js';
import type { Business } from '../domain/types.js';
import { bearerFrom, businessFor } from './auth.js';
import { Sessions } from './sessions.js';
import { log } from '../log.js';
import { withRequest, type RequestContext } from './request-context.js';

const IDLE_MS = 30 * 60 * 1000;

/** Servidor con sesiones por negocio: una McpServer/transport por sesión, atadas al negocio del token. */
export function createApp(deps: { store: Store; devBusinessId?: string; host: string }): Express {
  if (deps.devBusinessId && deps.host !== '127.0.0.1') {
    throw new Error('COUNTERPART_DEV_BUSINESS solo se permite escuchando en 127.0.0.1');
  }

  const app = createMcpExpressApp({ host: deps.host });
  const sessions = new Sessions();
  const sweeper = setInterval(() => sessions.sweep(Date.now(), IDLE_MS), 60_000);
  sweeper.unref();

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.all('/mcp', (req: Request, res: Response) => {
    const context: RequestContext = { requestId: randomUUID() };
    const started = performance.now();

    res.on('finish', () => {
      const assigned = res.getHeader('mcp-session-id');
      log({
        level: 'info', msg: 'http', requestId: context.requestId,
        method: req.method, path: req.path, status: res.statusCode,
        businessId: context.businessId,
        sessionId: context.sessionId ?? (assigned === undefined ? undefined : String(assigned)),
        durationMs: Math.round(performance.now() - started)
      });
    });

    return withRequest(context, async () => {
      const business = await resolveBusiness(deps, req);
      if (!business) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      context.businessId = business.id;

      const sessionId = req.header('mcp-session-id');
      context.sessionId = sessionId;

      if (sessionId) {
        const entry = sessions.get(sessionId, business.id);
        if (!entry) {
          res.status(403).json({ error: 'forbidden' });
          return;
        }
        sessions.touch(sessionId, Date.now());
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
      const ctx: ToolContext = {
        business, profile: loadProfile(business.profileId), store: deps.store,
        now: () => new Date(), newId: prefix => `${prefix}-${randomUUID()}`
      };
      registerTools(server, ctx);

      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => sessions.set(id, { transport, server, businessId: business.id, lastSeen: Date.now() }),
        onsessionclosed: id => sessions.drop(id)
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  });

  app.locals.sessions = sessions;
  return app;
}

async function resolveBusiness(deps: { store: Store; devBusinessId?: string }, req: Request): Promise<Business | null> {
  const token = bearerFrom(req.header('authorization'));
  if (token) return businessFor(deps.store, token);
  if (deps.devBusinessId) return deps.store.getBusiness(deps.devBusinessId);
  return null;
}
