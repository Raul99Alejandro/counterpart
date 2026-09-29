import type { Business, CatalogItem } from '../domain/types.js';
import { log } from '../log.js';
import type { Profile } from '../profiles/schema.js';
import { ConflictError, type Draft, type Store } from '../store/store.js';
import { generateSetup, type DraftGenerator } from './generate.js';
import { GENERIC_QUESTION } from './validate.js';

export const DRAFTS_PER_HOUR = 5;
export const DRAFT_TTL_SECONDS = 24 * 60 * 60;
/** Un borrador "generating" más viejo que esto quedó huérfano: el proceso se reinició a mitad de la generación. */
export const STALE_GENERATION_MS = 5 * 60 * 1000;
export const STALE_TEXT = "My last draft didn't finish. Tell me about your business again.";
const HOUR_MS = 60 * 60 * 1000;
/**
 * Tiempo mínimo entre el resumen y la activación. Nova llegó a llamar la activación un segundo
 * después de revisar, en el mismo turno y sin que nadie dijera que sí; una persona tarda más.
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
 * El asistente de configuración (spec B2 §5.2–5.3). La generación es asíncrona: el bridge da 6.5 s
 * por turno y un borrador con Nova tarda más (S4). Corre en el proceso, que es uno solo, y deja el
 * resultado en el registro DRAFT. Nada se activa sin `confirm: true`.
 */
export class SetupService {
  private readonly starts = new Map<string, number[]>();
  private readonly running = new Set<Promise<void>>();
  /** Generación en curso por negocio: revisar puede esperarla. */
  private readonly runs = new Map<string, Promise<void>>();
  /** Arranques en curso por negocio: se marca antes del primer await, para que dos llamadas a la vez no generen dos veces. */
  private readonly starting = new Set<string>();
  /** Último resumen listo que se le mostró al usuario, por negocio y borrador. */
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
    // Una sesión abierta antes de activar todavía tiene las tools de alta: no se genera nada.
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
   * Con `waitMs`, espera a que termine la generación en curso (hasta ese tope) antes de contestar.
   * Si contesta "todavía no" al instante, el agente vuelve a preguntar en bucle dentro del mismo turno.
   */
  async review(bizId: string, opts: { waitMs?: number } = {}): Promise<ReviewResult> {
    const run = this.runs.get(bizId);
    if (run && opts.waitMs) await Promise.race([run, delay(opts.waitMs)]);
    const draft = await this.current(bizId, this.deps.now());
    if (!draft) return { state: 'none' };
    if (draft.state === 'generating') return { state: 'generating' };
    if (draft.state === 'failed') return { state: 'failed', spoken: draft.error ?? GENERIC_QUESTION };
    this.reviewed.set(bizId, { createdAt: draft.createdAt, at: this.deps.now().getTime() });
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
    // El "sí" tiene que venir de una persona que oyó el resumen: no del modelo en el mismo turno.
    const seen = this.reviewed.get(bizId);
    if (!seen || seen.createdAt !== draft.createdAt || this.deps.now().getTime() - seen.at < MIN_CONFIRM_MS) {
      return { status: 'needs_confirmation' };
    }

    const business = await store.getBusiness(bizId);
    if (!business || business.status !== 'blank') return { status: 'none' };
    // Nunca una versión ya vista: un reset borra PROFILE con el proceso vivo y la caché de perfiles
    // (por versión) serviría el perfil del borrador anterior. La hora en ms es creciente y única.
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

  /** Espera a que terminen las generaciones en curso. Para pruebas y para un apagado ordenado. */
  async settled(): Promise<void> {
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  /** El borrador vigente: caducado → null (el TTL de DynamoDB llega tarde); "generating" huérfano → failed. */
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
      // Otro borrador lo reemplazó o se descartó mientras se generaba: no se pisa.
      if (!latest || latest.createdAt !== createdAt) return;
      if (outcome.ok) {
        await this.deps.store.putDraft(bizId, { ...latest, state: 'ready', profile: outcome.setup.profile, catalog: outcome.setup.items });
      } else {
        log({ level: 'warn', msg: 'setup_failed', businessId: bizId, errors: outcome.errors });
        await this.deps.store.putDraft(bizId, { ...latest, state: 'failed', error: outcome.spoken });
      }
    } catch (err) {
      // Nunca una promesa rechazada sin manejar: el borrador queda "generating" y a los 5 minutos cuenta como huérfano.
      log({ level: 'error', msg: 'setup_crashed', businessId: bizId, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
  }
}

/** Espera que no retiene el proceso vivo. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
