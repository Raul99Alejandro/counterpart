import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext { requestId: string; businessId?: string; sessionId?: string }

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta `run` con el contexto de la petición disponible para todo lo que llame, incluidas las tools. */
export function withRequest<T>(ctx: RequestContext, run: () => T): T {
  return storage.run(ctx, run);
}

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}
