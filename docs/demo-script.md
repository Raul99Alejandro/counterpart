# Guion del demo (≤ 3 min)

Las frases habladas van en inglés, tal como se dicen. Todas están en `test/golden/`.

## Antes de grabar

- [ ] Resembrar justo antes. Contra AWS, `npm run seed -- --reset` con `COUNTERPART_ALLOW_REMOTE_RESET=1` borra y vuelve a sembrar solo los negocios del demo; la tabla y los tokens ya emitidos quedan. El comando: `npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset`, con `AWS_PROFILE` y `AWS_REGION` exportados. Con la semilla fresca, la ventana de dos minutos de pedidos repetidos no afecta nada.
- [ ] Los tres pasteles del sábado salen sin importar el día en que siembres, porque sus vencimientos están fijados por día de la semana.
- [ ] Los reportes usan la fecha del negocio (Chicago). Grabar a cualquier hora ya no mueve los cobros de día.
- [ ] "How did we do this week compared to last week?" compara la semana en curso (incompleta) contra la anterior completa: a mitad de semana va a decir "down". Grabarla al final de la semana o ajustar la frase.
- [ ] Probar cada frase una vez contra el bridge antes de grabar.
- [ ] Si se redesplegó Counterpart, dejar las Skills 20 minutos sin uso antes de grabar, o comprobar que el bridge ya reconecta (friction log §15).
- [ ] Abrir las dos Skills una vez antes de grabar: el primer turno tras un rato despierta AgentCore y puede decir "I'm still starting up".

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
5. **2:35–3:00 · Cómo está hecho.** El diagrama de `docs/aws-builder.md` (ECS Express Mode, DynamoDB, Secrets Manager, Bedrock AgentCore con Nova 2 Lite) y el cierre: un motor, cualquier negocio con órdenes.
