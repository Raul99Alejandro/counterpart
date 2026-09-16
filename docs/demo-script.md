# Guion del demo (≤ 3 min)

Las frases habladas van en inglés, tal como se dicen. Todas están en `test/golden/`.

## Antes de grabar

- [ ] Resembrar la tabla justo antes. El comando exacto contra AWS lo define el Plan B2: borrar la tabla remota exige `COUNTERPART_ALLOW_REMOTE_RESET=1` y deja a los negocios sin tokens, así que después hay que emitir tokens nuevos con `npm run token` y actualizar el secreto del bridge. Con la semilla fresca, la ventana de dos minutos de pedidos repetidos no afecta nada.
- [ ] Los tres pasteles del sábado salen sin importar el día en que siembres, porque sus vencimientos están fijados por día de la semana.
- [ ] Los reportes usan la fecha del negocio (Chicago). Grabar a cualquier hora ya no mueve los cobros de día.
- [ ] Probar cada frase una vez contra el bridge antes de grabar.

## Guion

1. **0:00–0:20 · El problema.** Un mecánico debajo de un auto, con las manos ocupadas; el sistema está en una PC al fondo del taller.
2. **0:20–1:30 · El taller por voz.**
   - *"What's waiting on parts?"*
   - *"Add front brake pads to the Civic"*
   - *"Move the Civic into the bay"*
   - *"Close out the CX-5, they paid by card"* — se usa la CX-5 de Nina Patel, que ya está sembrada lista para entregar.
3. **1:30–1:55 · Lo visual.** *"How's the shop looking today?"* y *"How did we do this week compared to last week?"*, mostrando las dos UIs de MCP Apps. Se presentan como la interfaz que Alexa+ muestra en dispositivos con pantalla, sin hacerlas pasar por una captura de Alexa+.
4. **1:55–2:35 · Mismo servidor, otro negocio.**
   - *"How many cakes are due Saturday?"*
   - *"Take a cake order for Priya Shah, a 10-inch chocolate cake, due Saturday"*
   - *"Reorder whatever's low"*
5. **2:35–3:00 · Cómo está hecho.** El diagrama de `docs/aws-builder.md` y el cierre: un motor, cualquier negocio con órdenes.
