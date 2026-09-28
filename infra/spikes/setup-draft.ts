import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { bedrockConverse, generateSetup, novaDraftGenerator } from '../../src/setup/generate.js';

// Prueba manual del asistente contra Nova 2 Lite (spec B2 §6: una sola, fuera de npm test).
// Uso: npx tsx infra/spikes/setup-draft.ts "I run a flower shop..."   (con AWS_PROFILE y acceso a Bedrock)
const description = process.argv.slice(2).join(' ')
  || "I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery.";
const modelId = process.env.COUNTERPART_SETUP_MODEL_ID ?? 'us.amazon.nova-2-lite-v1:0';
const generate = novaDraftGenerator(bedrockConverse(new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' }), modelId));

const started = performance.now();
const outcome = await generateSetup(description, generate);
const ms = Math.round(performance.now() - started);
if (outcome.ok) {
  const { profile, items } = outcome.setup;
  console.log(`OK en ${ms} ms: ${profile.nouns.orders}, etapas ${profile.stages.map(s => s.id).join(' → ')}, ${items.length} ítems`);
  console.log(JSON.stringify(outcome.setup, null, 2));
} else {
  console.log(`FALLÓ en ${ms} ms: ${outcome.spoken}`);
  console.log(outcome.errors.join('\n'));
  process.exitCode = 1;
}
