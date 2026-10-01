import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/store/memory.js';
import { SetupService, STALE_TEXT } from '../../src/setup/service.js';
import { UNAVAILABLE_TEXT, type DraftGenerator } from '../../src/setup/generate.js';
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

/** What a person does: hears the summary and answers a few seconds later. */
async function reviewAndWait(svc: SetupService): Promise<void> {
  await svc.review('florist');
  clock = new Date(clock.getTime() + 5000);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('draft service', () => {
  it('generates in the background and leaves the draft ready', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    expect(await svc.start('florist', 'I run a flower shop')).toBe('started');
    await svc.settled();
    const review = await svc.review('florist');
    expect(review.state).toBe('ready');
    if (review.state === 'ready') expect(review.items).toHaveLength(7);
  });

  it('says it is still generating and does not start another generation meanwhile', async () => {
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

  it('limits to five drafts per business per hour', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    for (let i = 0; i < 5; i++) {
      expect(await svc.start('florist', `try ${i}`)).toBe('started');
      await svc.settled();
    }
    expect(await svc.start('florist', 'try 6')).toBe('limited');
    clock = new Date(NOW.getTime() + 61 * MINUTE);
    expect(await svc.start('florist', 'try 7')).toBe('started');
  });

  it('an unrepairable draft says what was missing', async () => {
    const hopeless = floristDraft();
    hopeless.profile.closedStage = 'done';
    const svc = service(await blankStore(), scriptedGenerator(hopeless));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: STAGES_QUESTION });
  });

  it('a generator that throws leaves the draft failed without crashing the process', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(new Error('AccessDeniedException')));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.review('florist')).toEqual({ state: 'failed', spoken: UNAVAILABLE_TEXT });
    expect(await store.getProfile('florist')).toBeNull();
  });

  it('an orphaned generation stops blocking after five minutes', async () => {
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

  it('an old generation that finishes late does not overwrite the new draft', async () => {
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

  it('an expired draft no longer exists even if the record is still there', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    clock = new Date(NOW.getTime() + 25 * 60 * MINUTE);
    expect(await svc.review('florist')).toEqual({ state: 'none' });
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm false discards the draft', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect(await svc.activate('florist', false)).toEqual({ status: 'discarded' });
    expect(await store.getDraft('florist')).toBeNull();
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('confirm true activates profile, catalog and status in a single write', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    await reviewAndWait(svc);
    const result = await svc.activate('florist', true);
    expect(result.status).toBe('activated');
    const business = (await store.getBusiness('florist'))!;
    expect(business).toMatchObject({ status: 'active', profileVersion: clock.getTime() });
    if (result.status === 'activated') expect(result.business).toEqual(business);
    expect(await store.getProfile('florist')).toMatchObject({ source: 'assistant', version: clock.getTime() });
    expect(await store.listItems('florist')).toHaveLength(7);
    expect(await store.getDraft('florist')).toBeNull();
  });

  it('does not activate without a draft or while generating', async () => {
    const pending = deferred<unknown>();
    const svc = service(await blankStore(), async () => pending.promise);
    expect(await svc.activate('florist', true)).toEqual({ status: 'none' });
    await svc.start('florist', 'flowers');
    expect(await svc.activate('florist', true)).toEqual({ status: 'not_ready' });
    pending.resolve(floristDraft());
    await svc.settled();
  });
  it('the profile version does not repeat after a reset that deleted the PROFILE', async () => {
    // A reset (business:new --reset) deletes the partition while the process is running: the profile cache
    // must not see the same version again for another draft.
    const versions: number[] = [];
    for (const minutes of [0, 30]) {
      clock = new Date(NOW.getTime() + minutes * MINUTE);
      const store = await blankStore();
      const svc = service(store, scriptedGenerator(floristDraft()));
      await svc.start('florist', 'flowers');
      await svc.settled();
      await reviewAndWait(svc);
      await svc.activate('florist', true);
      versions.push((await store.getBusiness('florist'))!.profileVersion);
    }
    expect(versions[0]).not.toBe(versions[1]);
  });
  it('an old session of an already active business does not start drafts', async () => {
    const store = await blankStore();
    const generate = scriptedGenerator(floristDraft());
    const svc = service(store, generate);
    await svc.start('florist', 'flowers');
    await svc.settled();
    await reviewAndWait(svc);
    await svc.activate('florist', true);
    expect(await svc.start('florist', 'flowers again')).toBe('already_active');
    expect(generate.attempts).toHaveLength(1);
    expect(await store.getDraft('florist')).toBeNull();
  });

  it('two starts at the same time generate only once', async () => {
    const generate = scriptedGenerator(floristDraft());
    const svc = service(await blankStore(), generate);
    const results = await Promise.all([svc.start('florist', 'first'), svc.start('florist', 'second')]);
    await svc.settled();
    expect(results.sort()).toEqual(['busy', 'started']);
    expect(generate.attempts).toHaveLength(1);
  });
  it('review can wait for the generation to finish, so the agent does not ask in a loop', async () => {
    const pending = deferred<unknown>();
    const svc = service(await blankStore(), async () => pending.promise);
    await svc.start('florist', 'flowers');
    setTimeout(() => pending.resolve(floristDraft()), 30);
    expect((await svc.review('florist', { waitMs: 5000 })).state).toBe('ready');
  });

  it('the review wait has a cap', async () => {
    const svc = service(await blankStore(), async () => new Promise(() => {}));
    await svc.start('florist', 'flowers');
    expect((await svc.review('florist', { waitMs: 30 })).state).toBe('generating');
  });
  it('does not activate if nobody had time to answer the summary: the model cannot confirm on its own', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    expect((await svc.review('florist')).state).toBe('ready');
    clock = new Date(NOW.getTime() + 1000);
    expect(await svc.activate('florist', true)).toEqual({ status: 'needs_confirmation' });
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
    clock = new Date(NOW.getTime() + 6000);
    expect((await svc.activate('florist', true)).status).toBe('activated');
  });

  it('does not activate a draft nobody reviewed', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    clock = new Date(NOW.getTime() + 60_000);
    expect(await svc.activate('florist', true)).toEqual({ status: 'needs_confirmation' });
    clock = new Date(NOW.getTime() + 120_000);
    expect(await svc.activate('florist', true)).toEqual({ status: 'needs_confirmation' });
  });
  it('retrying the activation in the same turn does not open the gate', async () => {
    const store = await blankStore();
    const svc = service(store, scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    await svc.review('florist');
    clock = new Date(NOW.getTime() + 1000);
    expect((await svc.activate('florist', true)).status).toBe('needs_confirmation');
    clock = new Date(NOW.getTime() + 4500);
    expect((await svc.activate('florist', true)).status).toBe('needs_confirmation');
    expect((await store.getBusiness('florist'))?.status).toBe('blank');
  });

  it('reviewing again in the yes turn does not trap the person in a loop', async () => {
    const svc = service(await blankStore(), scriptedGenerator(floristDraft()));
    await svc.start('florist', 'flowers');
    await svc.settled();
    await svc.review('florist');
    clock = new Date(NOW.getTime() + 10_000);
    await svc.review('florist');
    clock = new Date(NOW.getTime() + 11_000);
    expect((await svc.activate('florist', true)).status).toBe('activated');
  });
});
