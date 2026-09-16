import * as z from 'zod/v4';
import type { FieldDef, Profile, ToolKey } from '../profiles/schema.js';

export interface ToolSpec { name: string; title: string; description: string }

// Frase auxiliar para inyectar sinónimos del perfil en las descripciones
const alsoCalled = (words: string[]): string => words.length === 0 ? '' : ` (also called ${words.join(', ')})`;

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
      description: `Get today's summary: money taken in today, how many ${orders} are in each stage, what is due today, and which ${items} are running low. Use this when the user asks how the day or the business is going.`
    },
    find: {
      name: profile.toolNames.find,
      title: `Find ${orders}`,
      description: `Find open ${orders}${orderAlias} by ${customer} name${asset ? `, by ${asset}` : ''}, by stage (${stages}) or by due date. Use this when the user asks what is in progress, what is waiting, or how many are due on a day.`
    },
    open: {
      name: profile.toolNames.open,
      title: `Open a ${order}`,
      description: `Open a new ${order}${orderAlias} for a ${customer}${asset ? ` and their ${asset}` : ''}. Use this when the user wants to start a new job or take a new order.`
    },
    move: {
      name: profile.toolNames.move,
      title: `Change ${order} stage`,
      description: `Move a ${order} to another stage (${stages}). Use this when the user says work has started, is waiting, or is ready. To finish and charge a ${order}, use the close-out tool instead.`
    },
    addLine: {
      name: profile.toolNames.addLine,
      title: `Add to a ${order}`,
      description: `Add a ${item}${itemAlias} or a service to an existing ${order} and get the new total. Use this when the user says to add, put on, or charge something to a ${order}.`
    },
    stock: {
      name: profile.toolNames.stock,
      title: `Check ${items}`,
      description: `Check how many of a ${item}${itemAlias} are on hand, or list everything running low when no ${item} is named. Use this when the user asks if something is in stock or what is low.`
    },
    reorder: {
      name: profile.toolNames.reorder,
      title: `Reorder ${items}`,
      description: `Create supplier orders for ${items} that are at or below their reorder point, or for one named ${item}. Use this when the user says to reorder, restock, or order more.`
    },
    closeOut: {
      name: profile.toolNames.closeOut,
      title: `Close out a ${order}`,
      description: `Close out a finished ${order}, record how the ${customer} paid, and report the amount. Use this when the user says the ${order} was picked up, finished, or paid for.`
    },
    salesReport: {
      name: profile.toolNames.salesReport,
      title: 'Sales report',
      description: `Report sales for a period and compare it with the period before: total taken in, number of sales, average sale, and best selling ${items}. Use this when the user asks how sales are doing, how a day, week or month went, or how it compares.`
    }
  };
}

// Convierte una definición de campo del perfil en el schema zod correspondiente
function fieldSchema(field: FieldDef): z.ZodTypeAny {
  const base = field.type === 'integer' ? z.number().int() : z.string().min(1);
  return field.required ? base : base.optional();
}

// Shape mutable: z.ZodRawShape es de solo lectura en esta versión de zod,
// así que armamos el objeto con un tipo propio y lo pasamos a z.object al final.
type MutableShape = Record<string, z.ZodTypeAny>;

// Arma el shape de un z.object a partir de una lista de campos del perfil
function fieldsShape(fields: FieldDef[]): MutableShape {
  return Object.fromEntries(fields.map(f => [f.id, fieldSchema(f)]));
}

const dueDescription = 'A day such as "today", "tomorrow", a weekday like "saturday", or a date like 2026-09-19.';

export function openInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  const shape: MutableShape = {
    customerName: z.string().min(1).describe('The customer\'s name, as the user said it.'),
    customerPhone: z.string().optional().describe('The customer\'s phone number, if the user gives one.'),
    description: z.string().optional().describe('What the job is, in the user\'s words.'),
    ...fieldsShape(profile.orderFields)
  };

  // El objeto del activo solo existe si el perfil define uno
  if (profile.asset) {
    const assetShape = fieldsShape(profile.asset.fields);
    shape.asset = z.object(assetShape).describe(`The ${profile.asset.noun} this job is for.`);
  }
  if (profile.due === 'required') shape.due = z.string().describe(dueDescription);
  if (profile.due === 'optional') shape.due = z.string().optional().describe(dueDescription);

  return z.object(shape);
}

// Enum de etapas construido en tiempo de ejecución a partir del perfil
function stageEnum(profile: Profile): z.ZodTypeAny {
  const ids = profile.stages.map(s => s.id) as [string, ...string[]];
  return z.enum(ids);
}

export function findInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    query: z.string().optional().describe('A customer name or anything the user used to name the job.'),
    stage: stageEnum(profile).optional().describe('Only return jobs in this stage.'),
    due: z.string().optional().describe(dueDescription)
  });
}

export function moveInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job, such as "the Civic" or "order 42".'),
    stage: stageEnum(profile).describe('The stage to move it to.')
  });
}

export function addLineInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job.'),
    item: z.string().min(1).describe(`The ${profile.nouns.item} or service to add, by name.`),
    quantity: z.number().positive().optional().describe('How many. Defaults to 1. For labor, the number of hours.')
  });
}

export function itemQueryInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    item: z.string().optional().describe(`The ${profile.nouns.item} by name. Leave it out to cover everything that is low.`)
  });
}

export function closeOutInput(profile: Profile): z.ZodObject<z.ZodRawShape> {
  return z.object({
    order: z.string().min(1).describe('How the user referred to the job.'),
    paymentMethod: z.enum(['cash', 'card', 'check']).describe('How the customer paid.')
  });
}

export const salesReportInput = z.object({
  period: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month'])
    .describe('The period to report on.'),
  compare: z.boolean().optional().describe('Compare with the period before. Defaults to true.')
});
