import fs from 'node:fs';

// Only the profile YAML files: tsc already compiled the code.
fs.cpSync('src/profiles', 'dist/src/profiles', { recursive: true, filter: p => !p.endsWith('.ts') });

// The business packages: the in-memory seed also reads them from dist/ at startup.
fs.cpSync('seed/businesses', 'dist/seed/businesses', { recursive: true });
