import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Express, Request, Response } from 'express';

/** Servidor sin sesiones: uno por petición. La Task 12 lo reemplaza por sesiones por negocio. */
export function createApp(createServer: () => McpServer): Express {
  const app = createMcpExpressApp({ host: '0.0.0.0' });

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.all('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}
