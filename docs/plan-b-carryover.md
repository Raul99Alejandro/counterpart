# Lo que el Plan A deja abierto para el Plan B

**Estado:** Plan A completo en la rama `feat/core` — 92 pruebas, chequeo de tipos estricto limpio. Revisado tarea por tarea y con una revisión final de la rama entera; su ola de arreglos ya está aplicada y verificada.

Este documento existe porque el espacio de trabajo de ejecución (`.superpowers/sdd/`) está ignorado por git y se borra al cerrar el plan. Aquí queda lo que sí debe sobrevivir.

---

## 1. Invariantes que el `DynamoStore` tiene que preservar

Dos propiedades están fijadas por pruebas y las asume toda la capa de tools. `TransactWriteItems` las da gratis; el riesgo es "simplificarlas" al portar.

- **`commitOrderWithItems` valida TODAS las versiones antes de escribir cualquier registro.** Si algo choca, no se escribe nada. La prueba de `memory-store.test.ts` afirma que el ítem queda intacto tras un commit rechazado.
- **`listPayments(bizId, from, to)` es un rango de fechas civiles inclusivo en ambos extremos**, comparando los primeros 10 caracteres de `paidAt` en la zona horaria del negocio.

## 2. Seguridad, antes de desplegar

- **`allowedHosts`**: hoy el servidor escucha en `0.0.0.0` y eso desactiva la validación de host-header del SDK; lo único que queda delante es el bearer token. Configurar `allowedHosts` en `createMcpExpressApp` cuando exista el hostname del balanceador.
- **`DEMO_TOKENS` está en texto plano** en `seed/run.ts`, y el repo es público por requisito del hackathon. El servicio desplegado debe leer tokens reales de Secrets Manager; esas constantes no pueden llegar a configuración de producción.
- **No hay tope de sesiones por token**: un token válido puede abrir sesiones sin límite y solo las recupera el barrido de 30 minutos.

## 3. El hueco de observabilidad (§7.10 del spec)

El middleware de logs JSON (`requestId`, `sessionId`, `businessId`, tool, duración, código de error) no se construyó: sin destino de logs no había forma de verificarlo. Va junto con CloudWatch, y además le da un lugar donde reportar a dos sitios que hoy callan:

- `Sessions.drop()` se traga los errores de `close()` sin registrar nada.
- El `guard()` de `context.ts` escribe la línea JSON a **stderr**; el spec §7.10 dice stdout. Decidir uno al montar el middleware.

## 4. Cosas que afectan directamente al video

- **El panel de reporte de ventas (MCP Apps, §7.9) necesita `topItems` no vacío.** Ya lo está: la semilla genera partidas reales. No revertir eso o la UI se diseñará contra un estado vacío.
- **Las fechas de la pastelería dependen del día en que se siembra.** La línea del guion "3 pasteles para el sábado" solo es cierta si el servidor arranca en martes. Fijar los vencimientos a un cálculo real de día de la semana antes de grabar.
- **`this_week` contra `last_week` a mitad de semana** compara 2-3 días transcurridos contra 7 completos, lo que produce caídas aparentes enormes. El spec lo pide así; para el video conviene comparar días equivalentes.
- **La semilla calcula fechas en UTC**, no en `business.timezone`. Si el servidor se siembra entre las 19:00 y las 24:00 de Chicago, el "hoy" de la semilla va un día adelante del "hoy" que leen las tools.
- **Interop con un host MCP de terceros sigue sin verificarse.** El chequeo manual con `basic-host` no se pudo hacer (repo externo no clonado); se verificó el equivalente por HTTP directo. Cualquier detalle de conformidad que tropiece con otra implementación de cliente aparecería recién ahí.

## 5. Deuda menor, triada como "puede esperar"

Ninguna de estas bloquea nada; están ordenadas por lo que más barato sale arreglar mientras se toca el archivo.

**Habla y texto**
- Concordancia de número: "but only 2 **was** in stock", y "only 0 was in stock" cuando no queda nada. Un helper `was/were` lo arregla.
- `notFound` dice "Open ones are" incluso con una sola orden abierta.
- `snapshot` y `salesReport` emiten tres o cuatro oraciones, contra la regla de una o dos del §7.7 que sí se aplicó a `lineAdded`. O se relaja la regla en el spec o se recortan esos dos.
- Los disparadores de `snapshot` y `salesReport` se solapan para "how did today go". Es medible solo con las frases de oro: entra como insumo de esa pasada.

**Perfiles y dominio**
- `parseProfile` no reserva los ids `due`, `asset`, `customerName`, `customerPhone` ni `description`: un `orderFields` con uno de esos nombres sobrescribiría el campo en silencio. Tres líneas de guarda, y los perfiles son el punto de extensión.
- `resolver.ts` fija el nombre de campo `plate`, que es vocabulario de taller; `Object.values(asset.fields)` es genérico y estrictamente mejor. (El spec también lo nombra, así que es fuga de spec tanto como de código.)
- Los umbrales 0.5 / 0.15 están duplicados entre `findItem` y `resolveOrder`. Extraer un `pickBest` único — es la misma clase de deriva que ya causó un hallazgo importante.
- `addLineToOrder` no rechaza cantidades ≤ 0 (inalcanzable desde MCP, porque el esquema usa `positive()`), y `planReorder` no pone piso si `reorderQty` fuera ≤ 0.
- `findItem` devuelve los tres mejores como "closest matches" aunque todos puntúen 0.

**Infraestructura y empaque**
- `infra/copy-assets.mjs` copia también los `.ts` a `dist/`; falta `filter: p => !p.endsWith('.ts')`. Hacerlo junto con el Dockerfile.
- Falta el script `npm run seed -- <perfil>` que pide el spec §9; hoy la siembra solo ocurre al arrancar.
- `src/toy.ts` se sigue compilando aunque nada del servidor real lo usa. Es el blanco de los spikes del Plan B: que no entre a la imagen Docker.
- `package.json` conserva boilerplate de `npm init` (`main`, `directories`, descripción y autor vacíos), `"private"` como string en vez de booleano, y `@types/node` en `^22` contra `engines.node >= 24`.

**Detalles con consecuencias acotadas**
- `close-out.ts` en la rama `alreadyClosed` devuelve el método de pago *solicitado*, no el que quedó registrado.
- `takeOrderNumber` consume el número antes de escribir la orden: una escritura fallida quema un número y la numeración no es continua.
- Cada petición a `/mcp` con token válido pero sin session id ni `initialize` construye un `McpServer` y un transporte que nadie cierra, y vuelve a leer y parsear el YAML del perfil desde disco. Cachear el perfil.
- `moveStage` tiene una rama `closed` que es código muerto desde `move.ts` (que ya filtra órdenes abiertas), pero es API pública del dominio.
- La ventana de deduplicación de 2 minutos solo se prueba en su interior; el borde (justo antes y justo después) no.

## 6. Dos decisiones deliberadas que NO son deuda

- **`find` no tiene atajo por número de orden**, a diferencia de `resolveOrder`. Agregarlo cambiaría el contrato del filtro de `find`, no repara ninguna deriva.
- **La semilla no incluye una F-150**: el test de extremo a extremo abre una, y dos volverían ambigua la frase "the F-150". El guion del video usa la Mazda CX-5 de Nina Patel, que ya queda sembrada como lista para entrega.
