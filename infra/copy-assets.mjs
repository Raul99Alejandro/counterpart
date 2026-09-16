import fs from 'node:fs';

fs.cpSync('src/profiles', 'dist/src/profiles', { recursive: true });
