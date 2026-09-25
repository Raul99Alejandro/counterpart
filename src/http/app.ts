import { randomUUID } from 'node:crypto';
import { createMcpExpressApp, hostHeaderValidation } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import type { Express, NextFunction, Request, Response } from 'express';
import { loadProfile } from '../profiles/load.js';
import { registerTools, type ToolContext } from '../tools/context.js';
import type { Store } from '../store/store.js';
import type { Business } from '../domain/types.js';
import { bearerFrom, businessFor } from './auth.js';
import { Sessions } from './sessions.js';
import { log } from '../log.js';
import { currentRequest, withRequest, type RequestContext } from './request-context.js';
import type { HostPolicy } from './hosts.js';

const IDLE_MS = 30 * 60 * 1000;

/** Sesiones abiertas por negocio (spec B2 §4.4). La siguiente recibe 429. */
export const MAX_SESSIONS_PER_BUSINESS = 10;

/** Servidor con sesiones por negocio: una McpServer/transport por sesión, atadas al negocio del token. */
export function createApp(deps: {
  store: Store; devBusinessId?: string; host: string; hosts?: HostPolicy; maxSessionsPerBusiness?: number;
}): Express {
  if (deps.devBusinessId && deps.host !== '127.0.0.1') {
    throw new Error('COUNTERPART_DEV_BUSINESS solo se permite escuchando en 127.0.0.1');
  }

  const app = createMcpExpressApp({ host: deps.host });
  const maxSessions = deps.maxSessionsPerBusiness ?? MAX_SESSIONS_PER_BUSINESS;
  const sessions = new Sessions();
  const sweeper = setInterval(() => sessions.sweep(Date.now(), IDLE_MS), 60_000);
  sweeper.unref();

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  // Solo /mcp: el health check de /ping llega con la IP de la tarea como Host.
  const hosts = deps.hosts ?? { kind: 'any' };
  if (hosts.kind === 'list') app.use('/mcp', hostHeaderValidation(hosts.hosts));
  if (hosts.kind === 'closed') {
    app.use('/mcp', (_req: Request, res: Response) => { res.status(503).json({ error: 'not configured' }); });
  }

  app.all('/mcp', (req: Request, res: Response, next: NextFunction) => {
    const context: RequestContext = { requestId: randomUUID() };
    const started = performance.now();

    // 'close' y no 'finish': se emite una vez siempre, también si el cliente corta la petición
    // (un stream SSE abandonado nunca llega a 'finish').
    res.on('close', () => {
      const assigned = res.getHeader('mcp-session-id');
      log({
        level: 'info', msg: 'http', requestId: context.requestId,
        method: req.method, path: req.path, status: res.statusCode,
        businessId: context.businessId,
        sessionId: context.sessionId ?? (assigned === undefined ? undefined : String(assigned)),
        durationMs: Math.round(performance.now() - started)
      });
    });

    const handle = async (): Promise<void> => {
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
          // 404, como pide MCP para una sesión terminada: el cliente abre una nueva. Mismo código
          // si el id es de otro negocio, para no revelar que existe.
          res.status(404).json({ error: 'session not found' });
          return;
        }
        sessions.touch(sessionId, Date.now());
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      if (sessions.countFor(business.id) >= maxSessions) {
        log({ level: 'warn', msg: 'session_limit', requestId: context.requestId, businessId: business.id, limit: maxSessions });
        res.status(429).json({ error: 'too many sessions' });
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
    };

    // El catch se engancha dentro del contexto de la petición: así el middleware de errores
    // registra la misma requestId que la línea http.
    return withRequest(context, () => handle().catch(next));
  });

  // Errores fuera de las tools (p. ej. el store caído al buscar el token): una línea JSON en vez
  // del stack de Express en stderr. Nunca se registra la petición: lleva el token.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const context = currentRequest();
    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== undefined) {
      // Error del cliente (p. ej. JSON mal formado en express.json()): no es INTERNAL. Ocurre antes
      // de /mcp, sin contexto de petición, así que su línea http se escribe aquí.
      if (!context) {
        log({ level: 'info', msg: 'http', requestId: randomUUID(), method: req.method, path: req.path, status: clientStatus });
      }
    } else {
      log({
        level: 'error', msg: 'internal', code: 'INTERNAL',
        requestId: context?.requestId ?? randomUUID(),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
    }

    if (res.headersSent) {
      // La respuesta ya empezó y no se puede corregir: se corta la conexión, como hace Express.
      req.socket.destroy();
      return;
    }
    if (clientStatus !== undefined) res.status(clientStatus).json({ error: 'bad request' });
    else res.status(500).json({ error: 'internal' });
  });

  app.locals.sessions = sessions;
  return app;
}

/** El estado 4xx que traen los errores de cliente de Express (body-parser, http-errors); si no, undefined. */
function clientErrorStatus(err: unknown): number | undefined {
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

async function resolveBusiness(deps: { store: Store; devBusinessId?: string }, req: Request): Promise<Business | null> {
  const token = bearerFrom(req.header('authorization'));
  if (token) return businessFor(deps.store, token);
  if (deps.devBusinessId) return deps.store.getBusiness(deps.devBusinessId);
  return null;
}
