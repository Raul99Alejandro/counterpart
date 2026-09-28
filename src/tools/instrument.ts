import type { McpServer } from '@modelcontextprotocol/server';
import { currentRequest } from '../http/request-context.js';
import { log } from '../log.js';
import type { Business } from '../domain/types.js';
import type { ToolResult } from './context.js';

/** Resultados producidos por la frontera INTERNAL: el log los distingue de un error de negocio. */
export const internalResults = new WeakSet<object>();

type Callback = (...args: unknown[]) => Promise<ToolResult>;
type RegisterTool = (name: string, config: unknown, cb: Callback) => unknown;
/** Dueño de las tools que se registran: solo hace falta su id para el log. */
type Owner = { business: Pick<Business, 'id'> };

/**
 * Proxy sobre McpServer que mide y registra cada llamada a una tool. Las tools y los helpers
 * de MCP Apps lo reciben como si fuera el servidor real; todo lo demás pasa sin cambios.
 */
export function instrument(server: McpServer, owner: Owner): McpServer {
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool') {
        const register = (target.registerTool as unknown as RegisterTool).bind(target);
        return (name: string, config: unknown, cb: Callback) => register(name, config, timed(name, owner, cb));
      }
      // Sin `receiver`: los getters y métodos corren con el servidor real como `this`,
      // así funcionan aunque la clase use campos privados (#campo).
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
