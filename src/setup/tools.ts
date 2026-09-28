import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import * as z from 'zod/v4';
import type { Business } from '../domain/types.js';
import { log } from '../log.js';
import type { Profile } from '../profiles/schema.js';
import { say } from '../speech/say.js';
import { guard, ok } from '../tools/context.js';
import { instrument } from '../tools/instrument.js';
import { registerUiResources, UI } from '../tools/ui-assets.js';
import type { ActivateResult, SetupService, StartResult } from './service.js';
import { SETUP_TOOL_NAMES } from './validate.js';
import { setupView, setupViewSchema } from './view.js';

export interface SetupToolContext {
  business: Business;
  setup: SetupService;
  /** Lo llama la activación: la sesión cambia las tools de alta por las nueve del perfil. */
  onActivated: (business: Business, profile: Profile) => void;
}

const [SET_UP, REVIEW, ACTIVATE] = SETUP_TOOL_NAMES;

const START_TEXT: Record<StartResult, string> = {
  started: "I'm drafting your setup. Don't check on it yet: tell the user to ask you what you came up with in about twenty seconds.",
  busy: "I'm still working on your last description. Don't check on it yet: tell the user to ask again in about twenty seconds.",
  limited: "That's a lot of drafts in one hour. Give me a little while before trying again.",
  already_active: 'Your business is already set up. Open me again to use it.'
};

const NO_DRAFT = "There's no setup in progress. Tell me about your business, like: I run a flower shop that takes orders for bouquets.";
const STILL_DRAFTING = "I'm still drafting it. Don't check again in this turn: tell the user to ask again in a few seconds.";

export function draftSummary(profile: Profile, itemCount: number): string {
  const steps = profile.stages.map(s => s.label);
  const things = `${itemCount} ${itemCount === 1 ? profile.nouns.item : profile.nouns.items}`;
  return `I set you up to track ${profile.nouns.orders} through ${steps.length} steps: ${say.list(steps)}, `
    + `with ${things} in your catalog. Should I turn it on?`;
}

/** El bridge arma su agente una vez por sesión de Alexa: las tools nuevas se ven al reabrir la Skill (Decisión 1). */
export function readyText(business: Business, profile: Profile): string {
  const tryIt = profile.due === 'none' ? `what ${profile.nouns.orders} are open?` : `what ${profile.nouns.orders} are due today?`;
  return `${business.name} is ready. Open me again, then try: ${tryIt}`;
}

function activateText(result: ActivateResult): string {
  switch (result.status) {
    case 'activated': return readyText(result.business, result.profile);
    case 'discarded': return 'Okay, I threw that draft away. Tell me about your business again whenever you are ready.';
    case 'none': return "There's no finished setup to turn on yet. Tell me about your business first.";
    case 'not_ready': return STILL_DRAFTING;
    case 'conflict': return 'Something changed while I was saving, so nothing was turned on. Ask me to review the setup again.';
  }
}

/** Las tres tools de un negocio en blanco (spec B2 §5.2). Solo escriben en el negocio del token. */
export function registerSetupTools(server: McpServer, ctx: SetupToolContext): RegisteredTool[] {
  const s = instrument(server, ctx);
  const bizId = ctx.business.id;

  const setUp = s.registerTool(
    SET_UP,
    {
      title: 'Set up my business',
      description: 'Draft the setup for this business from the user\'s own description of what they sell and the steps an order goes through. Use this when the user describes their business, for example "I run a flower shop". Drafting takes a few seconds; afterwards use review_business_setup.',
      inputSchema: z.object({
        description: z.string().min(3).describe('What the business does and sells, and the steps an order goes through, in the user\'s words.')
      }),
      // El bridge le pasa a Nova el JSON y no el texto: la frase va también aquí.
      outputSchema: z.object({ status: z.enum(['started', 'busy', 'limited', 'already_active']), message: z.string() })
    },
    guard(async ({ description }: { description: string }) => {
      const status = await ctx.setup.start(bizId, description);
      return ok(START_TEXT[status], { status, message: START_TEXT[status] });
    })
  );

  const review = registerAppTool(
    s,
    REVIEW,
    {
      title: 'Review business setup',
      description: 'Tell the user what setup was drafted for their business and ask whether to turn it on. Use this when the user asks what you came up with, how the setup looks, or whether it is ready.',
      inputSchema: z.object({}),
      outputSchema: setupViewSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
      _meta: { ui: { resourceUri: UI.setup } }
    },
    guard(async () => {
      const result = await ctx.setup.review(bizId);
      const message = result.state === 'ready' ? draftSummary(result.profile, result.items.length)
        : result.state === 'generating' ? STILL_DRAFTING
        : result.state === 'failed' ? result.spoken
        : NO_DRAFT;
      return ok(message, setupView(ctx.business.name, result, message));
    })
  );

  const activate = s.registerTool(
    ACTIVATE,
    {
      title: 'Turn on business setup',
      description: 'Turn on the drafted setup after the user clearly says yes, or throw it away when they say no or want to start over. Use this only after review_business_setup.',
      inputSchema: z.object({
        confirm: z.boolean().describe('True only if the user clearly said yes to turning the setup on; false if they said no or want to start over.')
      }),
      outputSchema: z.object({ status: z.enum(['activated', 'discarded', 'none', 'not_ready', 'conflict']), message: z.string() })
    },
    guard(async ({ confirm }: { confirm: boolean }) => {
      const result = await ctx.setup.activate(bizId, confirm);
      if (result.status === 'activated') {
        // La activación ya quedó escrita: si el cambio de tools de la sesión falla, el negocio igual
        // está listo y la sesión nueva lo ve. Nunca "no cambié nada".
        try {
          ctx.onActivated(result.business, result.profile);
        } catch (err) {
          log({
            level: 'error', msg: 'setup_swap_failed', businessId: bizId,
            error: err instanceof Error ? `${err.name}: ${err.message}` : String(err)
          });
        }
      }
      const message = activateText(result);
      return ok(message, { status: result.status, message });
    })
  );

  registerUiResources(s, ['setup']);
  return [setUp, review, activate];
}
