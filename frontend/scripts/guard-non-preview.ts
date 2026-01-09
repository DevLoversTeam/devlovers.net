import { spawnSync } from 'node:child_process';

const context = process.env.CONTEXT || process.env.NETLIFY_CONTEXT;
const isPreview = context === 'deploy-preview' || context === 'branch-deploy';

if (isPreview) {
  console.log('[db] Skipping DB action in Netlify preview context.');
  process.exit(0);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('[db] Missing command to run.');
  process.exit(1);
}

const result = spawnSync(command, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
