import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

// Uso: npm run smoke -- <url del /mcp> <token>
// Se conecta como lo haría un cliente real: lista tools, llama al resumen y lee su UI.
const [url, token] = process.argv.slice(2);
if (!url || !token) {
  console.error('Uso: npm run smoke -- <url del /mcp> <token>');
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  fetch: (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
});
const client = new Client({ name: 'counterpart-smoke', version: '0.1.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}): ${tools.map(t => t.name).join(', ')}`);

const snapshot = tools.find(t => t.name.endsWith('_snapshot'));
if (!snapshot) throw new Error('el servidor no expone una tool de resumen');

const result = await client.callTool({ name: snapshot.name, arguments: {} });
console.log(`${snapshot.name}: ${(result.content as Array<{ text?: string }>)[0]?.text ?? '(sin texto)'}`);

const uri = (snapshot._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
if (!uri) throw new Error(`${snapshot.name} no declara su UI`);
const page = await client.readResource({ uri });
console.log(`ui ${uri}: ${(page.contents[0] as { text?: string }).text?.length ?? 0} bytes`);

await client.close();
