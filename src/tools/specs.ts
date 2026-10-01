import * as z from 'zod/v4';
import type { FieldDef, Profile, ToolKey } from '../profiles/schema.js';

export interface ToolSpec { name: string; title: string; description: string }

// Helper phrase to inject the profile's synonyms into the descriptions
const alsoCalled = (words: string[]): string => words.length === 0 ? '' : ` (also called ${words.join(', ')})`;

// Correct article depending on whether the profile's noun starts with a vowel sound
const article = (word: string): string => /^[aeiou]/i.test(word) ? 'an' : 'a';

/**
 * How to ask the model for the spoken reference to an order. The examples come from the profile:
 * a repair shop says "the vehicle", a bakery has no asset and names by customer.
 */
const orderReference = (profile: Profile): string => {
  const { order, customer } = profile.nouns;
  const asset = profile.asset?.noun;
  const examples = [`the ${customer}'s name`, ...(asset ? [`the ${asset}`] : [])];
  return `How the user referred to the ${order}, such as ${examples.join(', ')} or "${order} 42". `
    + `Pass it as the user said it; never ask for the ${order} number.`;
};

/** A field id said out loud: `card_message` → `card message`. */
export const spokenId = (id: string): string => id.replace(/_/g, ' ');

/** What opening an order strictly needs, said as a spoken list ("a, b and c"). */
function neededToOpen(profile: Profile): string {
  const needed = [
    `the ${profile.nouns.customer}'s name`,
    ...(profile.asset ? [`the ${profile.asset.noun}`] : []),
    ...profile.orderFields.filter(f => f.required).map(f => spokenId(f.id)),
    ...(profile.due === 'required' ? ['the due date'] : [])
  ];
  return needed.length === 1 ? needed[0]! : `${needed.slice(0, -1).join(', ')} and ${needed[needed.length - 1]}`;
}

export function toolSpecs(profile: Profile): Record<ToolKey, ToolSpec> {
  const { order, orders, item, items, customer } = profile.nouns;
  const orderAlias = alsoCalled(profile.synonyms.order);
  const itemAlias = alsoCalled(profile.synonyms.item);
  const asset = profile.asset?.noun;
  const stages = profile.stages.map(s => s.label).join(', ');

  return {
    snapshot: {
      name: profile.toolNames.snapshot,
      title: 'Business snapshot',
      description: `Get today's summary: money taken in today, how many ${orders} are in each stage, what is due today, and which ${items} are running low. Use this when the user asks how the day or the business is going, for a rundown, or what's on the board today.`
    },
    find: {
      name: profile.toolNames.find,
      title: `Find ${orders}`,
      description: `Find open ${orders}${orderAlias} by ${customer} name${asset ? `, by ${asset}` : ''}, by stage (${stages}) or by due date. Use this when the user asks what is in progress, what is waiting, or how many are due on a day.`
    },
    open: {
      name: profile.toolNames.open,
      title: `Open a ${order}`,
      description: `Open a new ${order}${orderAlias} for ${article(customer)} ${customer}${asset ? ` and their ${asset}` : ''}. Use this when the user wants to start or take a new ${order}. Fill in every detail the user already gave; do not ask for optional details such as a phone number. Needed: ${neededToOpen(profile)}. Leave anything else out instead of asking for it.`
    },
    move: {
      name: profile.toolNames.move,
      title: `Change ${order} stage`,
      description: `Move ${article(order)} ${order} to another stage (${stages}). Use this when the user says work has started, is waiting, or is ready. To finish and charge ${article(order)} ${order}, use the close-out tool instead.`
    },
    addLine: {
      name: profile.toolNames.addLine,
      title: `Add to a ${order}`,
      description: `Add ${article(item)} ${item}${itemAlias} or a service to an existing ${order} and get the new total. Use this when the user says to add, put on, or charge something to ${article(order)} ${order}.`
    },
    stock: {
      name: profile.toolNames.stock,
      title: `Check ${items}`,
      description: `Check how many of ${article(item)} ${item}${itemAlias} are on hand, or list everything running low when no ${item} is named. Use this when the user asks if something is in stock or what is low.`
    },
    reorder: {
      name: profile.toolNames.reorder,
      title: `Reorder ${items}`,
      description: `Create supplier orders for ${items} that are at or below their reorder point, or for one named ${item}. Use this when the user says to reorder, restock, or order more.`
    },
    closeOut: {
      name: profile.toolNames.closeOut,
      title: `Close out a ${order}`,
      description: `Close out a finished ${order} and record how the ${customer} paid. Use this when the user says the ${order} was picked up, finished, or paid for. It takes two steps: the first call only reads the amount back and asks; call it again with confirm: true only after the user says yes, in a later turn.`
    },
    salesReport: {
      name: profile.toolNames.salesReport,
      title: 'Sales report',
      description: `Report sales for a period and compare it with the period before: total taken in, number of sales, average sale, and best selling ${items}. Use this when the user asks how sales are doing, how a day, week or month went, or how it compares.`
    }
  };
}

// Turns a profile field definition into the matching zod schema
// Each field says what it is: without a description, Nova 2 Lite asked for a flavor the sentence already had.
function fieldSchema(field: FieldDef, owner: string): z.ZodTypeAny {
  const base = field.type === 'integer' ? z.number().int() : z.string().min(1);
  const described = base.describe(`The ${spokenId(field.id)} of the ${owner}, as the user said it.`);
  return field.required ? described : described.optional();
}

// Mutable shape: z.ZodRawShape is read-only in this zod version,
// so we build the object with our own type and pass it to z.object at the end.
type MutableShape = Record<string, z.ZodTypeAny>;

// Builds a z.object shape from a list of profile fields
function fieldsShape(fields: FieldDef[], owner: string): MutableShape {
  return Object.fromEntries(fields.map(f => [f.id, fieldSchema(f, owner)]));
}

const dueDescription = 'A day such as "today", "tomorrow", a weekday like "saturday", or a date like 2026-09-19.';

export function openInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  const { order, customer } = profile.nouns;
  const shape: MutableShape = {
    customerName: z.string().min(1).describe(`The ${customer}'s name, as the user said it.`),
    customerPhone: z.string().optional().describe(`The ${customer}'s phone number, if the user gives one.`),
    description: z.string().optional().describe(`What the ${order} is for, in the user's words.`),
    ...fieldsShape(profile.orderFields, order)
  };

  // The asset object only exists if the profile defines one
  if (profile.asset) {
    const assetShape = fieldsShape(profile.asset.fields, profile.asset.noun);
    shape.asset = z.object(assetShape).describe(`The ${profile.asset.noun} this ${order} is for.`);
  }
  if (profile.due === 'required') shape.due = z.string().describe(dueDescription);
  if (profile.due === 'optional') shape.due = z.string().optional().describe(dueDescription);

  return z.object(shape);
}

// Stage enum built at runtime from the profile
function stageEnum(profile: Profile): z.ZodTypeAny {
  const ids = profile.stages.map(s => s.id) as [string, ...string[]];
  return z.enum(ids);
}

export function findInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  const { order, orders, customer } = profile.nouns;
  return z.object({
    query: z.string().optional().describe(`A ${customer} name or anything the user used to name the ${order}.`),
    stage: stageEnum(profile).optional().describe(`Only return ${orders} in this stage.`),
    due: z.string().optional().describe(dueDescription)
  });
}

export function moveInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe(orderReference(profile)),
    stage: stageEnum(profile).describe('The stage to move it to.')
  });
}

export function addLineInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe(orderReference(profile)),
    item: z.string().min(1).describe(`The ${profile.nouns.item} or service to add, by name.`),
    quantity: z.number().positive().optional()
      .describe('How many. Defaults to 1. For anything priced by the hour, the number of hours.')
  });
}

export function itemQueryInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    item: z.string().optional().describe(`The ${profile.nouns.item} by name. Leave it out to cover everything that is low.`)
  });
}

export function closeOutInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe(orderReference(profile)),
    paymentMethod: z.enum(['cash', 'card', 'check']).describe(`How the ${profile.nouns.customer} paid.`),
    confirm: z.boolean().optional().describe('True only after the user heard the amount and said yes.')
  });
}

export const salesReportInput = z.object({
  period: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'])
    .describe('The period to report on.'),
  compare: z.boolean().optional().describe('Compare with the period before. Defaults to true.')
});
