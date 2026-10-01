import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext { requestId: string; businessId?: string; sessionId?: string }

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `run` with the request context available to everything it calls, including the tools. */
export function withRequest<T>(ctx: RequestContext, run: () => T): T {
  return storage.run(ctx, run);
}

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}
