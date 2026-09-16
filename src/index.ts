import { createApp } from './http/app.js';
import { MemoryStore } from './store/memory.js';
import type { Sessions } from './http/sessions.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const devBusinessId = process.env.COUNTERPART_DEV_BUSINESS;

// El Plan B cambia MemoryStore por DynamoStore según una variable de entorno.
// La Task 14 agrega el seeding (seedAll) de negocios y tokens de demo.
const store = new MemoryStore();

const app = createApp({ store, host, devBusinessId });
const httpServer = app.listen(port, host, () => {
  console.log(JSON.stringify({ msg: 'listening', port, host }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    (app.locals.sessions as Sessions).closeAll();
    httpServer.close(() => process.exit(0));
  });
}
