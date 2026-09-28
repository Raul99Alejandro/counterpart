# Guion del demo (≤ 3 min)

Las frases habladas van en inglés, tal como se dicen. Todas están en `test/golden/`.

## Antes de grabar

- [ ] Resembrar justo antes. Contra AWS, `npm run seed -- --reset` con `COUNTERPART_ALLOW_REMOTE_RESET=1` borra y vuelve a sembrar solo los negocios del demo; la tabla y los tokens ya emitidos quedan. El comando: `npx cross-env COUNTERPART_STORE=dynamo COUNTERPART_ALLOW_REMOTE_RESET=1 npm run seed -- --reset`, con `AWS_PROFILE` y `AWS_REGION` exportados. Con la semilla fresca, la ventana de dos minutos de pedidos repetidos no afecta nada.
- [ ] Los tres pasteles del sábado salen sin importar el día en que siembres, porque sus vencimientos están fijados por día de la semana.
- [ ] Los reportes usan la fecha del negocio (Chicago). Grabar a cualquier hora ya no mueve los cobros de día.
- [ ] "How did we do this week compared to last week?" compara la semana en curso (incompleta) contra la anterior completa: a mitad de semana va a decir "down". Grabarla al final de la semana o ajustar la frase.
- [ ] Probar cada frase una vez contra el bridge antes de grabar.
- [ ] Si se redesplegó Counterpart, dejar las Skills 20 minutos sin uso antes de grabar, o comprobar que el bridge ya reconecta (friction log §15).
- [ ] Si hubo ensayos con errores, limpiar la memoria del agente antes de grabar (sus respuestas fallidas se rehidratan en contenedores viejos; friction log §16). Para cada memoria, con `MemoryId` tomado de `cdk-outputs.json` del bridge: `aws bedrock-agentcore list-actors`, luego `list-sessions` y `list-events` → `delete-event` por evento, y `list-memory-records` en `/users/<actor>/preferences` y `/users/<actor>/sessions/<sesión>` → `delete-memory-record`.
- [ ] Abrir las dos Skills una vez antes de grabar: el primer turno tras un rato despierta AgentCore y puede decir "I'm still starting up".

## Guion

1. **0:00–0:20 · El problema.** Un mecánico debajo de un auto, con las manos ocupadas; el sistema está en una PC al fondo del taller.
2. **0:20–1:30 · El taller por voz.**
   - *"What's waiting on parts?"*
   - *"Add front brake pads to the Civic"*
   - *"Move the Civic into the bay"*
   - *"Close out the CX-5, they paid by card"* — se usa la CX-5 de Nina Patel, que ya está sembrada lista para entregar.
3. **1:30–1:55 · Lo visual.** *"How's the shop looking today?"* y *"How did we do this week compared to last week?"*, mostrando las dos UIs de MCP Apps. Se presentan como la interfaz que Alexa+ muestra en dispositivos con pantalla, sin hacerlas pasar por una captura de Alexa+.
4. **1:55–2:35 · Un negocio nuevo, configurado hablando.** "Petal and Stem" empieza en blanco (`npm run business:new -- florist "Petal and Stem" --reset` antes de grabar).
   - *"Open petal and stem"* → *"I run a flower shop. We take orders for bouquets and centerpieces, arrange them, and they're ready for pickup or delivery."*
   - Esperar unos 15 s y *"What did you come up with?"*, con la pantalla del borrador de basic-host como inserto.
   - *"Yes, turn it on"* → en la misma conversación: *"Take an order for Maria Lopez, a dozen roses for Friday"* → *"What bouquet orders are due Friday?"* (los sustantivos salen del borrador de Nova: revisarlos antes de grabar).
   - La pastelería queda como segundo perfil en el diagrama y en el texto de Devpost.
5. **2:35–3:00 · Cómo está hecho.** El diagrama de `docs/aws-builder.md` (ECS Express Mode, DynamoDB, Secrets Manager, Bedrock AgentCore con Nova 2 Lite) y el cierre: un motor, cualquier negocio con órdenes.
