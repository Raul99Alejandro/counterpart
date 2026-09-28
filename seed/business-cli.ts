import { checkPackage } from './package.js';

// Uso:
//   npm run business:check -- <carpeta>
const [command, ...args] = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

switch (command) {
  case 'check': {
    const dir = positional[0] ?? fail('Uso: npm run business:check -- <carpeta>');
    const result = checkPackage(dir);
    if (!result.ok) fail(`El paquete tiene ${result.problems.length} problema(s):\n- ${result.problems.join('\n- ')}`);
    console.log(`Paquete "${result.pkg.id}" válido: ${result.pkg.items.length} ítems, perfil ${result.pkg.profileSource}, ${result.pkg.demo.customers.length} clientes de demo.`);
    break;
  }
  default:
    fail('Subcomandos: check');
}
