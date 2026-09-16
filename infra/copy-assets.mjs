import fs from 'node:fs';

// Solo los YAML de perfiles: el código ya lo compiló tsc.
fs.cpSync('src/profiles', 'dist/src/profiles', { recursive: true, filter: p => !p.endsWith('.ts') });
