import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { profileSchema, TOOL_KEYS, type Profile } from './schema.js';
import type { ProfileRecord } from '../store/store.js';

const DIR = path.join(import.meta.dirname, '.');

/** Properties the open-order tool already uses; a custom field with that id would silently override it. */
const RESERVED_FIELD_IDS = new Set(['customerName', 'customerPhone', 'description', 'asset', 'due']);

export function parseProfile(raw: unknown): Profile {
  const p = profileSchema.parse(raw);
  const stageIds = new Set(p.stages.map(s => s.id));

  // Check that closedStage is one of the stages
  if (!stageIds.has(p.closedStage)) {
    throw new Error(`closedStage "${p.closedStage}" is not one of the stages`);
  }

  // Check that closeFrom holds only valid stages and does not include closedStage
  for (const s of p.closeFrom) {
    if (!stageIds.has(s)) throw new Error(`closeFrom has "${s}", which is not one of the stages`);
    if (s === p.closedStage) throw new Error(`closeFrom cannot include the closedStage "${s}"`);
  }

  // Check that there are no duplicate tool names
  const names = TOOL_KEYS.map(k => p.toolNames[k]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) throw new Error(`tool name "${dupes[0]}" is used twice; every tool needs its own name`);

  // If there is an asset, check that spokenAs only uses defined fields
  if (p.asset) {
    const fieldIds = new Set(p.asset.fields.map(f => f.id));
    for (const m of p.asset.spokenAs.matchAll(/\{([a-z0-9_]+)\}/g)) {
      if (!fieldIds.has(m[1]!)) throw new Error(`spokenAs uses "{${m[1]}}", which is not a field of the asset`);
    }
  }

  // Check that orderFields do not use reserved ids
  for (const f of p.orderFields) {
    if (RESERVED_FIELD_IDS.has(f.id)) throw new Error(`orderFields uses the reserved id "${f.id}"; pick another id`);
  }

  return p;
}

/** Profile templates: the YAML files in this folder. The server no longer reads them while serving requests. */
export function loadTemplate(id: string): Profile {
  const file = path.join(DIR, `${id}.yaml`);
  return parseProfile(parseYaml(fs.readFileSync(file, 'utf8')));
}

export function listTemplates(): string[] {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.yaml')).map(f => f.slice(0, -'.yaml'.length)).sort();
}

/** PROFILE record copied from a template, version 1. */
export function templateRecord(id: string): ProfileRecord {
  return { profile: loadTemplate(id), source: `template:${id}`, version: 1 };
}
