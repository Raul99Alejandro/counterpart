import type { McpServer } from '@modelcontextprotocol/server';
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import type { ToolContext, ToolResult } from './context.js';

/** Resultados producidos por la frontera INTERNAL: el log los distingue de un error de negocio. */
export const internalResults = new WeakSet<object>();

type Callback = (...args: unknown[]) => Promise<ToolResult>;
type RegisterTool = (name: string, config: unknown, cb: Callback) => unknown;

/**
 * Proxy sobre McpServer que mide y registra cada llamada a una tool. Las tools y los helpers
 * de MCP Apps lo reciben como si fuera el servidor real; todo lo demás pasa sin cambios.
 */
export function instrument(server: McpServer, ctx: ToolContext): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        const register = (target.registerTool as unknown as RegisterTool).bind(target);
        return (name: string, config: unknown, cb: Callback) => register(name, config, timed(name, ctx, cb));
      }
      // Sin `receiver`: los getters y métodos corren con el servidor real como `this`,
      // así funcionan aunque la clase use campos privados (#campo).
      const value: unknown = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function timed(tool: string, ctx: ToolContext, cb: Callback): Callback {
  return async (...args) => {
    const started = performance.now();
    const result = await cb(...args);
    const request = currentRequest();
    log({
      level: 'info', msg: 'tool', tool, businessId: ctx.business.id,
      requestId: request?.requestId, sessionId: request?.sessionId,
      durationMs: Math.round(performance.now() - started),
      outcome: internalResults.has(result) ? 'internal' : result.isError ? 'domain_error' : 'ok'
    });
    return result;
  };
}
