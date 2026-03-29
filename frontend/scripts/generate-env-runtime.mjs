import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const examplePath = resolve(root, '.env.example');
const outputPath = resolve(root, 'lib/env/runtime-env.generated.ts');

const keyRegex = /^([A-Z][A-Z0-9_]*)=/;

const keys = Array.from(
  new Set(
    readFileSync(examplePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const match = line.match(keyRegex);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  )
);

const entries = [];

for (const key of keys) {
  const value = process.env[key];
  if (typeof value !== 'string' || value.length === 0) continue;
  entries.push([key, value]);
}

const objectBody = entries
  .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
  .join('\n');

const fileContent = `import 'server-only';

export const RUNTIME_ENV: Readonly<Record<string, string>> = {
${objectBody}
};
`;

writeFileSync(outputPath, fileContent, 'utf8');
console.log(`[env] generated runtime-env.generated.ts with ${entries.length} keys`);
