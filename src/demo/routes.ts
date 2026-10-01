import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type Router } from 'express';
import type { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import type { Business } from '../domain/types.js';
import { businessFor } from '../http/auth.js';
import { log } from '../log.js';
import type { ConverseFn } from '../setup/generate.js';
import type { Store } from '../store/store.js';
import { packageRoot } from '../tools/ui-assets.js';
import { runTurn } from './agent.js';
import { DemoLimits } from './limits.js';
import { createSandbox } from './sandbox.js';

export interface DemoDeps {
  converse: ConverseFn;
  limits?: DemoLimits;
}

const PAGE = path.join(packageRoot(), 'build', 'ui', 'demo', 'index.html');
const turnBody = z.object({
  token: z.string().min(1).max(200),
  text: z.string().trim().min(1).max(300),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(2000),
    calls: z.array(z.object({
      tool: z.string().max(100), arguments: z.record(z.string(), z.unknown()), isError: z.boolean(), result: z.string().max(2000)
    })).max(5).optional()
  })).max(40).default([])
});
const LIMIT_MESSAGE = 'The demo is busy right now. Please try again in a little while.';

/**
 * The judges' demo (docs: demo-for-judges): sandboxes, spoken turns through a Nova agent over
 * in-process MCP, and the MCP App pages. Only tokens of demo sandboxes are accepted here.
 */
export function demoRouter(deps: DemoDeps & {
  store: Store; now: () => Date; openInProcess: (business: Business) => Promise<{ client: Client; close: () => Promise<void> }>;
}): Router {
  const router = express.Router();
  const limits = deps.limits ?? new DemoLimits();
  router.use(express.json({ limit: '16kb' }));

  /** The demo business behind a token, or null for unknown, expired or non-demo tokens. */
  const demoBusiness = async (token: string): Promise<Business | null> => {
    const business = await businessFor(deps.store, token, deps.now());
    return business && business.id.startsWith('demo-') ? business : null;
  };

  router.get('/', (_req: Request, res: Response) => {
    if (!fs.existsSync(PAGE)) { res.status(503).type('text/plain').send('demo page not built'); return; }
    res.type('html').sendFile(PAGE);
  });

  router.post('/api/sandbox', async (req: Request, res: Response) => {
    if (!limits.takeSandbox(clientIp(req), deps.now().getTime())) {
      res.status(429).json({ error: 'limit', message: LIMIT_MESSAGE });
      return;
    }
    const sandbox = await createSandbox(deps.store, deps.now());
    log({ level: 'info', msg: 'demo_sandbox', expiresAt: sandbox.expiresAt });
    res.status(201).json(sandbox);
  });

  router.post('/api/turn', async (req: Request, res: Response) => {
    const parsed = turnBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'bad request' }); return; }
    const business = await demoBusiness(parsed.data.token);
    if (!business) { res.status(401).json({ error: 'unauthorized' }); return; }
    // The sandbox is the business id without its kind: its three businesses share one budget.
    const sandboxId = business.id.replace(/-[a-z]+$/, '');
    if (!limits.takeTurn(sandboxId, deps.now().getTime())) {
      res.status(429).json({ error: 'limit', message: LIMIT_MESSAGE });
      return;
    }

    const { client, close } = await deps.openInProcess(business);
    try {
      const started = performance.now();
      const turn = await runTurn({ client, converse: deps.converse, text: parsed.data.text, history: parsed.data.history.slice(-12) });
      const after = (await deps.store.getBusiness(business.id)) ?? business;
      log({
        level: 'info', msg: 'demo_turn', businessId: business.id, tools: turn.calls.map(c => c.tool),
        durationMs: Math.round(performance.now() - started)
      });
      res.json({ ...turn, business: { name: after.name, status: after.status } });
    } finally {
      await close();
    }
  });

  router.get('/api/ui', async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const uri = typeof req.query.uri === 'string' ? req.query.uri : '';
    if (!uri.startsWith('ui://counterpart/')) { res.status(400).json({ error: 'bad request' }); return; }
    const business = await demoBusiness(token);
    if (!business) { res.status(401).json({ error: 'unauthorized' }); return; }

    const { client, close } = await deps.openInProcess(business);
    try {
      const read = await client.readResource({ uri });
      const html = read.contents.find(c => 'text' in c && typeof c.text === 'string') as { text: string } | undefined;
      if (!html) { res.status(404).json({ error: 'not found' }); return; }
      res.type('html').send(html.text);
    } finally {
      await close();
    }
  });

  return router;
}

/** The visitor's address: the load balancer puts it first in X-Forwarded-For. */
function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}
