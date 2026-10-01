import { randomUUID } from 'node:crypto';
import { createMcpExpressApp, hostHeaderValidation } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { isInitializeRequest, McpServer } from '@modelcontextprotocol/server';
import type { Express, NextFunction, Request, Response } from 'express';
import { ProfileCache } from '../profiles/cache.js';
import type { Profile } from '../profiles/schema.js';
import { unavailableGenerator, type DraftGenerator } from '../setup/generate.js';
import { SetupService } from '../setup/service.js';
import { registerSetupTools } from '../setup/tools.js';
import { registerUiResources } from '../tools/ui-assets.js';
import { registerTools, type ToolContext } from '../tools/context.js';
import type { Store } from '../store/store.js';
import type { Business } from '../domain/types.js';
import { bearerFrom, businessFor } from './auth.js';
import { Sessions } from './sessions.js';
import { log } from '../log.js';
import { currentRequest, withRequest, type RequestContext } from './request-context.js';
import type { HostPolicy } from './hosts.js';

const IDLE_MS = 30 * 60 * 1000;

/** Open sessions per business (spec B2 §4.4). The next one gets 429. */
export const MAX_SESSIONS_PER_BUSINESS = 10;

/** Server with per-business sessions: one McpServer/transport per session, bound to the token's business. */
export function createApp(deps: {
  store: Store; devBusinessId?: string; host: string; hosts?: HostPolicy; maxSessionsPerBusiness?: number;
  generate?: DraftGenerator; now?: () => Date;
}): Express {
  if (deps.devBusinessId && deps.host !== '127.0.0.1') {
    throw new Error('COUNTERPART_DEV_BUSINESS is only allowed when listening on 127.0.0.1');
  }

  const app = createMcpExpressApp({ host: deps.host });
  const maxSessions = deps.maxSessionsPerBusiness ?? MAX_SESSIONS_PER_BUSINESS;
  const sessions = new Sessions();
  const profiles = new ProfileCache(deps.store);
  const now = deps.now ?? (() => new Date());
  // One per process: the hourly cap and in-flight generations belong to the business, not the session.
  const setup = new SetupService({ store: deps.store, generate: deps.generate ?? unavailableGenerator, now });

  const toolContext = (business: Business, profile: Profile): ToolContext => ({
    business, profile, store: deps.store, now, newId: prefix => `${prefix}-${randomUUID()}`
  });

  /** Active business → its nine tools. Blank → the three setup tools, swapped for the nine on activation. */
  async function registerFor(server: McpServer, business: Business, state: { status: Business['status'] }): Promise<void> {
    if (business.status === 'active') {
      registerTools(server, toolContext(business, await profiles.forBusiness(business)));
      return;
    }
    // Before connecting: the pages the profile will use once activated must already exist (Step 3b).
    registerUiResources(server, ['snapshot', 'sales-report']);
    const setupTools = registerSetupTools(server, {
      business, setup,
      onActivated: (active, profile) => {
        state.status = 'active';
        // The session stays alive (spec B2 §5.2): setup tools out, profile tools in, and the client is notified.
        for (const tool of setupTools) tool.remove();
        registerTools(server, toolContext(active, profile));
        server.sendToolListChanged();
      }
    });
  }
  const sweeper = setInterval(() => sessions.sweep(Date.now(), IDLE_MS), 60_000);
  sweeper.unref();

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  // Only /mcp: the /ping health check arrives with the task's IP as Host.
  const hosts = deps.hosts ?? { kind: 'any' };
  if (hosts.kind === 'list') app.use('/mcp', hostHeaderValidation(hosts.hosts));
  if (hosts.kind === 'closed') {
    app.use('/mcp', (_req: Request, res: Response) => { res.status(503).json({ error: 'not configured' }); });
  }

  app.all('/mcp', (req: Request, res: Response, next: NextFunction) => {
    const context: RequestContext = { requestId: randomUUID() };
    const started = performance.now();

    // 'close', not 'finish': it always fires once, even if the client aborts the request
    // (an abandoned SSE stream never reaches 'finish').
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
          // 404, as MCP requires for a terminated session: the client opens a new one. Same code
          // if the id belongs to another business, so as not to reveal that it exists.
          res.status(404).json({ error: 'session not found' });
          return;
        }
        if (entry.state.status !== business.status) {
          // The business changed state outside this session (a reset, or activated from another one):
          // its tools no longer match. 404, and the client opens a new session with the right ones.
          sessions.drop(sessionId);
          res.status(404).json({ error: 'session not found' });
          return;
        }
        sessions.touch(sessionId, Date.now());
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      // Without a session id only initialize is valid: anything else would build a server and a
      // transport that nobody closes (carryover §5).
      if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
        res.status(400).json({ error: 'missing session id' });
        return;
      }

      if (sessions.countFor(business.id) >= maxSessions) {
        log({ level: 'warn', msg: 'session_limit', requestId: context.requestId, businessId: business.id, limit: maxSessions });
        res.status(429).json({ error: 'too many sessions' });
        return;
      }

      const server = new McpServer({ name: 'counterpart', version: '0.1.0' });
      const state = { status: business.status };
      await registerFor(server, business, state);

      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => sessions.set(id, { transport, server, businessId: business.id, state, lastSeen: Date.now() }),
        onsessionclosed: id => sessions.drop(id)
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    };

    // The catch is attached inside the request context, so the error middleware
    // logs the same requestId as the http line.
    return withRequest(context, () => handle().catch(next));
  });

  // Errors outside the tools (e.g. the store down while looking up the token): one JSON line instead
  // of the Express stack on stderr. The request is never logged: it carries the token.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const context = currentRequest();
    const clientStatus = clientErrorStatus(err);
    if (clientStatus !== undefined) {
      // Client error (e.g. malformed JSON in express.json()): not INTERNAL. It happens before
      // /mcp, with no request context, so its http line is written here.
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
      // The response has already started and cannot be fixed: drop the connection, as Express does.
      req.socket.destroy();
      return;
    }
    if (clientStatus !== undefined) res.status(clientStatus).json({ error: 'bad request' });
    else res.status(500).json({ error: 'internal' });
  });

  app.locals.sessions = sessions;
  app.locals.setup = setup;
  return app;
}

/** The 4xx status carried by Express client errors (body-parser, http-errors); otherwise undefined. */
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
