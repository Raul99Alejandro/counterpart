import {
  ConverseCommand, type BedrockRuntimeClient, type Message, type SystemContentBlock,
  type ToolConfiguration, type ToolInputSchema
} from '@aws-sdk/client-bedrock-runtime';
import * as z from 'zod/v4';
import { loadTemplate } from '../profiles/load.js';
import { draftSchema, spokenFailure, validateSetup, type SetupCheck, type ValidSetup } from './validate.js';

export type ConverseFn = (input: {
  system: SystemContentBlock[]; messages: Message[]; toolConfig: ToolConfiguration;
}) => Promise<Message>;

export interface Attempt { description: string; previous?: { draft: unknown; errors: string[] } }
export type DraftGenerator = (attempt: Attempt) => Promise<unknown>;
export type SetupOutcome = { ok: true; setup: ValidSetup } | { ok: false; spoken: string; errors: string[] };

export const SETUP_TOOL = 'save_business_setup';

/** El modelo contestó sin llamar a la herramienta: es un intento fallido y se repara. */
export class NoSetupInReply extends Error {
  constructor() {
    super(`no ${SETUP_TOOL} call in the reply`);
    this.name = 'NoSetupInReply';
  }
}

/** Bedrock no respondió (permisos, throttling, modelo): pedir más detalle no lo arregla. */
export const UNAVAILABLE_TEXT = "I couldn't reach my drafting service just now. Try again in a minute.";

/** Esquema JSON de la herramienta, derivado de los esquemas zod: una sola fuente de verdad (spec B2 §5.3). */
export const SETUP_INPUT_SCHEMA: Record<string, unknown> = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(draftSchema, { io: 'input' }) as Record<string, unknown>;
  return schema;
})();

/** Un intento y, si falla la validación, una reparación con la lista exacta de errores. */
export async function generateSetup(description: string, generate: DraftGenerator): Promise<SetupOutcome> {
  const first = await attempt(generate, { description });
  if (first.check.ok) return { ok: true, setup: first.check.setup };
  // El servicio falló: una reparación sería otra llamada fallida.
  if (first.unavailable) return { ok: false, errors: first.check.errors, spoken: UNAVAILABLE_TEXT };
  const second = await attempt(generate, { description, previous: { draft: first.draft, errors: first.check.errors } });
  if (second.check.ok) return { ok: true, setup: second.check.setup };
  return { ok: false, errors: second.check.errors, spoken: spokenFailure(second.check.errors) };
}

async function attempt(
  generate: DraftGenerator, input: Attempt
): Promise<{ draft: unknown; check: SetupCheck; unavailable?: boolean }> {
  try {
    const draft = await generate(input);
    return { draft, check: validateSetup(draft) };
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const check: SetupCheck = { ok: false, errors: [`the model did not return a setup (${reason})`] };
    return { draft: null, check, unavailable: !(err instanceof NoSetupInReply) };
  }
}

const EXAMPLE = JSON.stringify({
  profile: loadTemplate('bakery'),
  catalog: {
    items: [
      { id: 'cake-8', name: '8-inch round cake', kind: 'product', unit: 'cake', priceCents: 4500, stocked: false, consumes: { 'box-8': 1 } },
      { id: 'delivery', name: 'Delivery', kind: 'product', unit: 'trip', priceCents: 2500, taxable: false, stocked: false },
      { id: 'box-8', name: '8-inch cake box', kind: 'supply', unit: 'each', priceCents: 120, stocked: true, onHand: 40, reorderPoint: 20, reorderQty: 100 }
    ]
  }
});

const SYSTEM_PROMPT = `You set up Counterpart, an order-tracking assistant for small businesses, from the owner's own description.
Call ${SETUP_TOOL} exactly once with a profile and a catalog.

The profile:
- nouns: what the business calls one order and many orders (for example "flower order", "flower orders"), one item and many items, and a customer.
- synonyms: other words people use for an order and for an item.
- stages: 3 to 6 steps an order goes through, in order, with snake_case ids and short spoken labels. The last stage means finished and paid; put its id in closedStage.
- closeFrom: the stages an order can be closed out from, usually the one right before closedStage.
- toolNames: nine different snake_case tool names in the business's own words, for snapshot, find, open, move, addLine, stock, reorder, closeOut and salesReport. Never use set_up_my_business, review_business_setup or activate_business_setup.
- asset: null, unless every order is about one physical thing the customer brings in (a car, a bike). Then its noun, 1 to 4 fields, and spokenAs such as "{year} {make} {model}".
- orderFields: up to 4 details every order records, with snake_case ids and type string or integer. Never use customerName, customerPhone, description, asset or due, and never add a field for a date: the due setting already covers when an order is for.
- due: "required" if every order is for a date, "optional" if some are, "none" if never.

The catalog: at least 12 and at most 25 items, never fewer than 12. Include both what customers buy (several products or services with different sizes or options) and what the business stocks to make them (supplies, parts or ingredients). Each has a lowercase-dash id, a short name that is easy to say, a kind (product or labor for what customers buy; part, supply or ingredient for what the business stocks), a unit, priceCents as a whole number of cents, and stocked (true for things counted on a shelf). Stocked items also get onHand, reorderPoint and reorderQty. Every product made from stocked items has consumes saying which stocked items one unit uses up, by id (for example a dozen-rose bouquet consumes 12 rose stems and 1 wrap). Use realistic US prices. The example below is shortened; your catalog must be longer.

Example for a bakery:
${EXAMPLE}`;

export function novaDraftGenerator(converse: ConverseFn): DraftGenerator {
  return async ({ description, previous }) => {
    const text = previous
      ? `${description}\n\nYour last setup had these problems:\n- ${previous.errors.join('\n- ')}\n\n`
        + `Here it is. Fix every problem and call ${SETUP_TOOL} again:\n${JSON.stringify(previous.draft)}`
      : description;
    const message = await converse({
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: [{ text }] }],
      toolConfig: {
        tools: [{
          toolSpec: {
            name: SETUP_TOOL,
            description: 'Save the setup for this business.',
            // El SDK tipa el documento JSON con su propio tipo; el esquema es JSON puro.
            inputSchema: { json: SETUP_INPUT_SCHEMA } as unknown as ToolInputSchema
          }
        }],
        toolChoice: { tool: { name: SETUP_TOOL } }
      }
    });
    const use = message.content?.find(block => block.toolUse?.name === SETUP_TOOL)?.toolUse;
    if (!use) throw new NoSetupInReply();
    return use.input;
  };
}

/** Converse contra Bedrock. Solo `src/setup/` llama a un modelo (spec B2 §3). */
export function bedrockConverse(client: BedrockRuntimeClient, modelId: string): ConverseFn {
  return async input => {
    const out = await client.send(new ConverseCommand({
      modelId, ...input, inferenceConfig: { maxTokens: 6000, temperature: 0.2 }
    }));
    const message = out.output?.message;
    if (!message) throw new Error('empty reply from the model');
    return message;
  };
}

/** Default sin modelo configurado: el borrador queda fallido con la frase genérica. */
export const unavailableGenerator: DraftGenerator = async () => {
  throw new Error('setup generator not configured');
};
