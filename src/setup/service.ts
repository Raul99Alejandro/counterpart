import type { Business, CatalogItem } from '../domain/types.js';
import { log } from '../log.js';
import type { Profile } from '../profiles/schema.js';
import { ConflictError, type Draft, type Store } from '../store/store.js';
import { generateSetup, type DraftGenerator } from './generate.js';
import { GENERIC_QUESTION } from './validate.js';

export const DRAFTS_PER_HOUR = 5;
export const DRAFT_TTL_SECONDS = 24 * 60 * 60;
/** A "generating" draft older than this was orphaned: the process restarted mid-generation. */
export const STALE_GENERATION_MS = 5 * 60 * 1000;
export const STALE_TEXT = "My last draft didn't finish. Tell me about your business again.";
const HOUR_MS = 60 * 60 * 1000;
/**
 * Minimum time between the summary and activation. Nova once called activation one second
 * after reviewing, in the same turn and without anyone saying yes; a person takes longer.
 */
export const MIN_CONFIRM_MS = 4000;

export type StartResult = 'started' | 'busy' | 'limited' | 'already_active';
export type ReviewResult =
  | { state: 'none' }
  | { state: 'generating' }
  | { state: 'failed'; spoken: string }
  | { state: 'ready'; profile: Profile; items: CatalogItem[] };
export type ActivateResult =
  | { status: 'activated'; business: Business; profile: Profile }
  | { status: 'discarded' }
  | { status: 'none' }
  | { status: 'not_ready' }
  | { status: 'conflict' }
  | { status: 'needs_confirmation' };

/**
 * The setup assistant (spec B2 §5.2–5.3). Generation is asynchronous: the bridge allows 6.5 s
 * per turn and a Nova draft takes longer (S4). It runs in-process, which is a single process, and leaves the
 * result in the DRAFT record. Nothing is activated without `confirm: true`.
 */
export class SetupService {
  private readonly starts = new Map<string, number[]>();
  private readonly running = new Set<Promise<void>>();
  /** In-flight generation per business: review can wait for it. */
  private readonly runs = new Map<string, Promise<void>>();
  /** In-flight starts per business: marked before the first await, so two concurrent calls do not generate twice. */
  private readonly starting = new Set<string>();
  /** Last ready summary shown to the user, per business and draft. */
  private readonly reviewed = new Map<string, { createdAt: string; at: number }>();

  constructor(private readonly deps: { store: Store; generate: DraftGenerator; now: () => Date }) {}

  async start(bizId: string, description: string): Promise<StartResult> {
    if (this.starting.has(bizId)) return 'busy';
    this.starting.add(bizId);
    try {
      return await this.begin(bizId, description);
    } finally {
      this.starting.delete(bizId);
    }
  }

  private async begin(bizId: string, description: string): Promise<StartResult> {
    const now = this.deps.now();
    // A session opened before activation still has the setup tools: nothing is generated.
    if ((await this.deps.store.getBusiness(bizId))?.status !== 'blank') return 'already_active';
    if ((await this.current(bizId, now))?.state === 'generating') return 'busy';

    const recent = (this.starts.get(bizId) ?? []).filter(t => now.getTime() - t < HOUR_MS);
    if (recent.length >= DRAFTS_PER_HOUR) {
      this.starts.set(bizId, recent);
      return 'limited';
    }
    this.starts.set(bizId, [...recent, now.getTime()]);

    const createdAt = now.toISOString();
    await this.deps.store.putDraft(bizId, {
      description, state: 'generating', createdAt,
      expiresAt: Math.floor(now.getTime() / 1000) + DRAFT_TTL_SECONDS
    });
    const run: Promise<void> = this.generate(bizId, description, createdAt).finally(() => {
      this.running.delete(run);
      if (this.runs.get(bizId) === run) this.runs.delete(bizId);
    });
    this.running.add(run);
    this.runs.set(bizId, run);
    return 'started';
  }

  /**
   * With `waitMs`, waits for the in-flight generation to finish (up to that cap) before answering.
   * If it answers "not yet" right away, the agent keeps asking in a loop within the same turn.
   */
  async review(bizId: string, opts: { waitMs?: number } = {}): Promise<ReviewResult> {
    const run = this.runs.get(bizId);
    if (run && opts.waitMs) await Promise.race([run, delay(opts.waitMs)]);
    const draft = await this.current(bizId, this.deps.now());
    if (!draft) return { state: 'none' };
    if (draft.state === 'generating') return { state: 'generating' };
    if (draft.state === 'failed') return { state: 'failed', spoken: draft.error ?? GENERIC_QUESTION };
    // The first time this draft is shown: reviewing it again does not restart the wait,
    // or a model that reviews before activating would trap the person in a loop.
    if (this.reviewed.get(bizId)?.createdAt !== draft.createdAt) {
      this.reviewed.set(bizId, { createdAt: draft.createdAt, at: this.deps.now().getTime() });
    }
    return { state: 'ready', profile: draft.profile!, items: draft.catalog! };
  }

  async activate(bizId: string, confirm: boolean): Promise<ActivateResult> {
    const { store } = this.deps;
    const draft = await this.current(bizId, this.deps.now());
    if (!draft || draft.state === 'failed') return { status: 'none' };
    if (draft.state === 'generating') return { status: 'not_ready' };
    if (!confirm) {
      await store.deleteDraft(bizId);
      return { status: 'discarded' };
    }
    // The "yes" must come from a person who heard the summary, not from the model in the same turn.
    const seen = this.reviewed.get(bizId);
    if (!seen || seen.createdAt !== draft.createdAt || this.deps.now().getTime() - seen.at < MIN_CONFIRM_MS) {
      // A rejected attempt restarts the wait: retrying in the same turn does not satisfy it.
      // Without a prior review nothing is recorded: the summary has not been shown yet.
      if (seen?.createdAt === draft.createdAt) this.reviewed.set(bizId, { ...seen, at: this.deps.now().getTime() });
      return { status: 'needs_confirmation' };
    }

    const business = await store.getBusiness(bizId);
    if (!business || business.status !== 'blank') return { status: 'none' };
    // Never a version already seen: a reset deletes PROFILE while the process is alive, and the profile
    // cache (keyed by version) would serve the previous draft's profile. The time in ms is increasing and unique.
    const previous = (await store.getProfile(bizId))?.version ?? 0;
    const version = Math.max(previous + 1, this.deps.now().getTime());
    const active: Business = { ...business, status: 'active', profileVersion: version };
    try {
      await store.activateBusiness(bizId, {
        business: active, profile: { profile: draft.profile!, source: 'assistant', version }, items: draft.catalog!
      });
    } catch (err) {
      if (err instanceof ConflictError) return { status: 'conflict' };
      throw err;
    }
    return { status: 'activated', business: { ...active, version: active.version + 1 }, profile: draft.profile! };
  }

  /** Waits for in-flight generations to finish. For tests and for a clean shutdown. */
  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  /** The current draft: expired → null (DynamoDB TTL arrives late); orphaned "generating" → failed. */
  private async current(bizId: string, now: Date): Promise<Draft | null> {
    const draft = await this.deps.store.getDraft(bizId);
    if (!draft || draft.expiresAt * 1000 <= now.getTime()) return null;
    if (draft.state === 'generating' && now.getTime() - Date.parse(draft.createdAt) > STALE_GENERATION_MS) {
      return { ...draft, state: 'failed', error: STALE_TEXT };
    }
    return draft;
  }

  private async generate(bizId: string, description: string, createdAt: string): Promise<void> {
    try {
      const outcome = await generateSetup(description, this.deps.generate);
      const latest = await this.deps.store.getDraft(bizId);
      // Another draft replaced it or it was discarded while generating: do not overwrite.
      if (!latest || latest.createdAt !== createdAt) return;
      if (outcome.ok) {
        await this.deps.store.putDraft(bizId, { ...latest, state: 'ready', profile: outcome.setup.profile, catalog: outcome.setup.items });
      } else {
        log({ level: 'warn', msg: 'setup_failed', businessId: bizId, errors: outcome.errors });
        await this.deps.store.putDraft(bizId, { ...latest, state: 'failed', error: outcome.spoken });
      }
    } catch (err) {
      // Never an unhandled rejected promise: the draft stays "generating" and after 5 minutes counts as orphaned.
      log({ level: 'error', msg: 'setup_crashed', businessId: bizId, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
}

/** A wait that does not keep the process alive. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
