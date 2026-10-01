import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as z from 'zod/v4';
import { catalogProblems, catalogSchema, slug, toCatalogItems } from '../src/catalog/schema.js';
import { resolveDue } from '../src/domain/dates.js';
import type { CatalogItem } from '../src/domain/types.js';
import { listTemplates, loadTemplate, parseProfile } from '../src/profiles/load.js';
import type { Profile } from '../src/profiles/schema.js';
import { formatIssues } from '../src/validation/issues.js';

function isTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const businessFileSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().refine(isTimeZone, 'not a known time zone'),
  taxRateBps: z.number().int().min(0).max(5000),
  firstOrderNumber: z.number().int().positive().default(1),
  template: z.string().min(1).optional(),
  profile: z.unknown().optional()
}).strict().refine(b => (b.template === undefined) !== (b.profile === undefined), {
  message: 'set either template or profile, not both (and not neither)', path: ['template']
});

const demoOrderSchema = z.object({
  stage: z.string().min(1),
  fields: z.record(z.string(), z.string()).default({}),
  due: z.string().optional(),
  lines: z.array(z.string()).default([]),
  hoursAgo: z.number().positive().optional()
}).strict();

const demoCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  asset: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  order: demoOrderSchema.optional()
}).strict();

const demoFileSchema = z.object({
  historySeed: z.number().int().optional(),
  customers: z.array(demoCustomerSchema).default([])
}).strict();

export type DemoOrder = z.output<typeof demoOrderSchema>;
export type DemoCustomer = z.output<typeof demoCustomerSchema>;
export type DemoFile = z.output<typeof demoFileSchema>;

export interface BusinessPackage {
  id: string;
  name: string;
  timezone: string;
  taxRateBps: number;
  firstOrderNumber: number;
  profile: Profile;
  profileSource: string;
  items: CatalogItem[];
  demo: DemoFile;
}

export type PackageCheck = { ok: true; pkg: BusinessPackage } | { ok: false; problems: string[] };

/** Reads a package YAML file. `undefined` if it is missing and optional; problems go to `problems`. */
function readYaml(dir: string, file: string, required: boolean, problems: string[]): unknown {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    if (required) problems.push(`${file}: file not found`);
    return undefined;
  }
  try {
    return parseYaml(fs.readFileSync(full, 'utf8')) ?? {};
  } catch (err) {
    problems.push(`${file}: not valid YAML (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
    return undefined;
  }
}

/** Validates a `seed/businesses/<bizId>/` package with the server's own schemas (spec B2 §5.1). */
export function checkPackage(dir: string): PackageCheck {
  const problems: string[] = [];
  const id = path.basename(dir);
  if (!slug.safeParse(id).success) {
    problems.push(`folder name "${id}": use lowercase letters, digits and dashes; it becomes the business id`);
  }

  const businessRaw = readYaml(dir, 'business.yaml', true, problems);
  const catalogRaw = readYaml(dir, 'catalog.yaml', true, problems);
  const demoRaw = readYaml(dir, 'demo.yaml', false, problems);

  let business: z.output<typeof businessFileSchema> | undefined;
  if (businessRaw !== undefined) {
    const parsed = businessFileSchema.safeParse(businessRaw);
    if (parsed.success) business = parsed.data;
    else problems.push(...formatIssues(parsed.error).map(p => `business.yaml › ${p}`));
  }

  let profile: Profile | undefined;
  let profileSource = '';
  if (business?.template !== undefined) {
    if (listTemplates().includes(business.template)) {
      profile = loadTemplate(business.template);
      profileSource = `template:${business.template}`;
    } else {
      problems.push(`business.yaml › template: there is no template "${business.template}"; use one of ${listTemplates().join(', ')}, or write your own profile`);
    }
  } else if (business?.profile !== undefined) {
    try {
      profile = parseProfile(business.profile);
      profileSource = 'package';
    } catch (err) {
      if (err instanceof z.ZodError) problems.push(...formatIssues(err, 'profile').map(p => `business.yaml › ${p}`));
      else problems.push(`business.yaml › profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let items: CatalogItem[] | undefined;
  if (catalogRaw !== undefined) {
    const parsed = catalogSchema.safeParse(catalogRaw);
    if (parsed.success) {
      const found = catalogProblems(parsed.data.items, 'items');
      if (found.length === 0) items = toCatalogItems(parsed.data.items);
      else problems.push(...found.map(p => `catalog.yaml › ${p}`));
    } else {
      problems.push(...formatIssues(parsed.error).map(p => `catalog.yaml › ${p}`));
    }
  }

  let demo: DemoFile = { customers: [] };
  if (demoRaw !== undefined) {
    const parsed = demoFileSchema.safeParse(demoRaw);
    if (parsed.success) demo = parsed.data;
    else problems.push(...formatIssues(parsed.error).map(p => `demo.yaml › ${p}`));
  }
  if (business && profile && items) {
    problems.push(...demoProblems(demo, profile, items, business.timezone).map(p => `demo.yaml › ${p}`));
  }

  if (problems.length > 0 || !business || !profile || !items) return { ok: false, problems };
  return {
    ok: true,
    pkg: {
      id, name: business.name, timezone: business.timezone, taxRateBps: business.taxRateBps,
      firstOrderNumber: business.firstOrderNumber, profile, profileSource, items, demo
    }
  };
}

/** Same as checkPackage, but throws with every problem. Used for seeding. */
export function loadPackage(dir: string): BusinessPackage {
  const result = checkPackage(dir);
  if (!result.ok) throw new Error(`The package ${dir} is invalid:\n- ${result.problems.join('\n- ')}`);
  return result.pkg;
}

function demoProblems(demo: DemoFile, profile: Profile, items: CatalogItem[], timezone: string): string[] {
  const problems: string[] = [];
  const openStages = new Set(profile.stages.map(s => s.id).filter(s => s !== profile.closedStage));
  const itemIds = new Set(items.map(i => i.id));
  demo.customers.forEach((c, i) => {
    const at = `customers[${i}]`;
    if (c.asset && !profile.asset) problems.push(`${at}.asset: this profile has no asset; remove it`);
    if (profile.asset && c.order) {
      if (!c.asset) problems.push(`${at}.asset: the profile needs a ${profile.asset.noun} for every order`);
      for (const f of profile.asset.fields) {
        const value = c.asset?.[f.id];
        if (f.required && value === undefined) problems.push(`${at}.asset.${f.id}: required by the profile`);
        if (value !== undefined && f.type === 'integer' && !Number.isInteger(value)) problems.push(`${at}.asset.${f.id}: must be a whole number`);
      }
    }
    const order = c.order;
    if (!order) return;
    if (!openStages.has(order.stage)) problems.push(`${at}.order.stage: "${order.stage}" is not an open stage; use one of ${[...openStages].join(', ')}`);
    for (const f of profile.orderFields) {
      if (f.required && order.fields[f.id] === undefined) problems.push(`${at}.order.fields.${f.id}: required by the profile`);
    }
    for (const key of Object.keys(order.fields)) {
      if (!profile.orderFields.some(f => f.id === key)) problems.push(`${at}.order.fields.${key}: the profile has no such order field`);
    }
    if (profile.due === 'required' && order.due === undefined) problems.push(`${at}.order.due: required by the profile`);
    if (profile.due === 'none' && order.due !== undefined) problems.push(`${at}.order.due: this profile has no due dates; remove it`);
    if (order.due !== undefined && resolveDue(order.due, timezone, new Date()) === null) {
      problems.push(`${at}.order.due: "${order.due}" is not a day; use a weekday such as saturday or a date like 2026-10-03`);
    }
    order.lines.forEach((line, j) => {
      if (!itemIds.has(line)) problems.push(`${at}.order.lines[${j}]: there is no item with id "${line}"`);
    });
  });
  return problems;
}
