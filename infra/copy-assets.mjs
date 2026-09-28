import fs from 'node:fs';

// Solo los YAML de perfiles: el código ya lo compiló tsc.
fs.cpSync('src/profiles', 'dist/src/profiles', { recursive: true, filter: p => !p.endsWith('.ts') });

// Los paquetes de negocio: la siembra en memoria los lee al arrancar también desde dist/.
fs.cpSync('seed/businesses', 'dist/seed/businesses', { recursive: true });
