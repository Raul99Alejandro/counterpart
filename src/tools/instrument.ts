import type { McpServer } from '@modelcontextprotocol/server';
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import type { Business } from '../domain/types.js';
import type { ToolResult } from './context.js';

/** Results produced by the INTERNAL boundary: the log tells them apart from a business error. */
export const internalResults = new WeakSet<object>();

type Callback = (...args: unknown[]) => Promise<ToolResult>;
type RegisterTool = (name: string, config: unknown, cb: Callback) => unknown;
/** Owner of the tools being registered: only its id is needed for the log. */
type Owner = { business: Pick<Business, 'id'> };

/**
 * Proxy over McpServer that times and logs every tool call. The tools and the MCP Apps
 * helpers receive it as if it were the real server; everything else passes through unchanged.
 */
export function instrument(server: McpServer, owner: Owner): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        const register = (target.registerTool as unknown as RegisterTool).bind(target);
        return (name: string, config: unknown, cb: Callback) => register(name, config, timed(name, owner, cb));
      }
      // No `receiver`: getters and methods run with the real server as `this`,
      // so they work even if the class uses private fields (#field).
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function timed(tool: string, owner: Owner, cb: Callback): Callback {
  return async (...args) => {
    const started = performance.now();
    const result = await cb(...args);
    const request = currentRequest();
    log({
      level: 'info', msg: 'tool', tool, businessId: owner.business.id,
      requestId: request?.requestId, sessionId: request?.sessionId,
      durationMs: Math.round(performance.now() - started),
      outcome: internalResults.has(result) ? 'internal' : result.isError ? 'domain_error' : 'ok'
    });
    return result;
  };
}
