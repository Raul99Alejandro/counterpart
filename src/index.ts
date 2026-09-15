import { createApp } from './http/app.js';
import { createToyServer } from './toy.js';

const port = Number(process.env.PORT ?? 3000);
const httpServer = createApp(createToyServer).listen(port, () => {
  console.log(JSON.stringify({ msg: 'listening', port }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => httpServer.close(() => process.exit(0)));
}
