# Spikes del Plan B2

Resultados de los spikes del spec B2 §4.2. Sin datos de la cuenta: ni número, ni ARNs, ni URLs.

## S1 — Counterpart en ECS Express Mode
Pendiente: se corre en la Task 6 del plan de la Etapa 1.

## S2 — Dos despliegues del bridge en una cuenta
Revisado sobre `KayLerch/alexa-skill-mcp-bridge` en `ca2c2ef`, sin desplegar nada.

- Archivos que fijan el nombre del stack:
  - `infra/bin/app.ts`: el id del stack, `'AlexaMcpBridgeStack'`.
  - `scripts/lib.ts`: `export const STACK_NAME = 'AlexaMcpBridgeStack'`, que usan `scripts/deploy.ts` (deploy y `cdk-outputs.json`), `scripts/destroy.ts` (destroy y el archivo de assets) y `readOutputs()`.
  - `packages/cli/src/remote.ts`: lee `outputs.AlexaMcpBridgeStack?.RuntimeArn` para `npm run chat -- --remote`.
- Recursos con nombre físico fijo: en `infra/lib/alexa-mcp-bridge-stack.ts`, AgentCore Memory `memoryName: 'alexa_mcp_bridge'` y AgentCore Runtime `runtimeName: 'alexa_mcp_bridge'`. Con `features.gateway` activo, además `gatewayName: 'alexa-mcp-bridge'` (apagado por defecto y en Counterpart). Los demás recursos (Lambda, roles, logs) toman nombres generados por CDK a partir del id del stack.
- `cdk synth` en Windows se quedó más de 10 minutos preparando el asset de la imagen del agente (el contexto es la raíz del repo); se cortó y los nombres se sacaron del código del stack.
- Decisión: el parche de la Task 8 lleva **tres** cambios: (1) nombre del stack desde `BRIDGE_STACK_NAME` en `infra/bin/app.ts`, `scripts/lib.ts` y `packages/cli/src/remote.ts`; (2) `BRIDGE_INVOCATION_NAME` como override de `skill.invocationName`; (3) `memoryName`, `runtimeName` y `gatewayName` derivados del nombre del stack cuando no es el de fábrica, para que dos despliegues no choquen.

## S3 — Frase libre con tools que cambian después del despliegue
Pendiente: se corre en la Task 8.

## S4 — Latencia de un borrador con Nova 2 Lite
- 10 corridas de `infra/spikes/nova-latency.ts` (tool use forzado, esquema de perfil y catálogo reducido): **p50 1423 ms, p95 3300 ms**. La corrida más lenta fue la primera (en frío); las otras nueve quedaron entre 1.3 y 1.6 s. Las 10 devolvieron tool use.
- El esquema real (perfil completo más un catálogo de hasta 60 ítems) genera bastante más salida que este, así que su latencia será mayor.
- Decisión para la Etapa 2: **asíncrono**, como dice el spec B2 §5.3. El p95 pasa de 3 s ya con el esquema reducido, y el bridge da 6.5 s por turno a todo el agente, no solo a la tool.
