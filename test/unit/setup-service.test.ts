import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { SetupService, STALE_TEXT } from '../../src/setup/service.js';
import type { DraftGenerator } from '../../src/setup/generate.js';
import { GENERIC_QUESTION, STAGES_QUESTION } from '../../src/setup/validate.js';
import { newBlankBusiness } from '../../seed/business.js';
import { floristDraft, scriptedGenerator } from '../helpers/setup.js';

const NOW = new Date('2026-09-29T15:00:00Z');
const MINUTE = 60_000;
let clock: Date;
beforeEach(() => { clock = NOW; });

async function blankStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  await newBlankBusiness(store, { id: 'florist', name: 'Petal and Stem' });
  return store;
}

const service = (store: MemoryStore, generate: DraftGenerator) => new SetupService({ store, generate, now: () => clock });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('servicio de borradores', () => {
  it('genera en segundo plano y deja el borrador listo', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    expect(await svc.start('florist', 'I run a flower shop')).toBe('started');
    await svc.settled();
    const review = await svc.review('florist');
    expect(review.state).toBe('ready');
    if (review.state === 'ready') expect(review.items).toHaveLength(7);
  });

  it('dice que sigue generando y no arranca otra generación mientras tanto', async () => {
    const pending = deferred<unknown>();
    let calls = 0;
    const svc = service(await blankStore(), async () => { calls += 1; return pending.promise; });
    await svc.start('florist', 'I run a flower shop');
    expect((await svc.review('florist')).state).toBe('generating');
    expect(await svc.start('florist', 'I run a flower shop, again')).toBe('busy');
    expect(calls).toBe(1);
    pending.resolve(floristDraft());
    await svc.settled();
    expect((await svc.review('florist')).state).toBe('ready');
  });

  it('limita a cinco borradores por negocio por hora', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    for (let i = 0; i < 5; i++) {
      expect(await svc.start('florist', `try ${i}`)).toBe('started');
      await svc.settled();
    }
    expect(await svc.start('florist', 'try 6')).toBe('limited');
    clock = new Date(NOW.getTime() + 61 * MINUTE);
    expect(await svc.start('florist', 'try 7')).toBe('started');
  });

  it('un borrador irreparable dice qué faltó', async () => {
    const hopeless = floristDraft();
    hopeless.profile.closedStage = 'done';
    const svc = service(await blankStore(), scriptedGenerator(hopeless));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: STAGES_QUESTION });
  });

  it('un generador que lanza deja el borrador fallido sin romper el proceso', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(new Error('AccessDeniedException')));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: GENERIC_QUESTION });
    expect(await store.getProfile('florist')).toBeNull();
  });

  it('una generación huérfana deja de bloquear a los cinco minutos', async () => {
    const store = await blankStore();
    await store.putDraft('florist', {
      description: 'flowers', state: 'generating', createdAt: NOW.toISOString(), expiresAt: NOW.getTime() / 1000 + 86400
    });
    const svc = service(store, scriptedGenerator(floristDraft()));
    expect(await svc.start('florist', 'again')).toBe('busy');
    clock = new Date(NOW.getTime() + 6 * MINUTE);
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: STALE_TEXT });
    expect(await svc.start('florist', 'again')).toBe('started');
  });

  it('una generación vieja que termina tarde no pisa el borrador nuevo', async () => {
    const slow = deferred<unknown>();
    const small = floristDraft();
    small.catalog.items = small.catalog.items.filter((i: { id: string }) => i.id !== 'centerpiece' && i.id !== 'vase');
    let call = 0;
    const svc = service(await blankStore(), async () => (++call === 1 ? slow.promise : small));
    await svc.start('florist', 'first');
    clock = new Date(NOW.getTime() + 6 * MINUTE);
    expect(await svc.start('florist', 'second')).toBe('started');
    await vi.waitFor(async () => expect((await svc.review('florist')).state).toBe('ready'));
    slow.resolve(floristDraft());
    await svc.settled();
    const review = await svc.review('florist');
    expect(review.state === 'ready' && review.items.length).toBe(5);
  });

  it('un borrador caducado ya no existe aunque el registro siga ahí', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    clock = new Date(NOW.getTime() + 25 * 60 * MINUTE);
    expect(await svc.review('florist')).toEqual({ state: 'none' });
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm false descarta el borrador', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.activate('florist', false)).toEqual({ status: 'discarded' });
    expect(await store.getDraft('florist')).toBeNull();
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm true activa perfil, catálogo y estado en una sola escritura', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    const result = await svc.activate('florist', true);
    expect(result.status).toBe('activated');
    const business = (await store.getBusiness('florist'))!;
    expect(business).toMatchObject({ status: 'active', profileVersion: 1 });
    if (result.status === 'activated') expect(result.business).toEqual(business);
    expect(await store.getProfile('florist')).toMatchObject({ source: 'assistant', version: 1 });
    expect(await store.listItems('florist')).toHaveLength(7);
    expect(await store.getDraft('florist')).toBeNull();
  });

  it('no activa sin borrador ni mientras genera', async () => {
    const pending = deferred<unknown>();
    const svc = service(await blankStore(), async () => pending.promise);
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    await svc.start('florist', 'flowers');
    expect(await svc.activate('florist', true)).toEqual({ status: 'not_ready' });
    pending.resolve(floristDraft());
    await svc.settled();
  });
});
