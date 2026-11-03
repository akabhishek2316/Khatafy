// Bundles the real app (apps/web/src) for E2E with esbuild, swapping @supabase/supabase-js for the shim.
import { createRequire } from 'node:module';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const require = createRequire(import.meta.url);

export async function buildForE2E(outDir: string): Promise<string> {
  const esbuild = require('esbuild');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [join(web, 'src/main.tsx')], bundle: true, outdir: outDir, format: 'esm', platform: 'browser', target: 'es2020',
    jsx: 'automatic', sourcemap: false, logLevel: 'error',
    alias: { '@supabase/supabase-js': join(here, 'shim/supabase-js.ts'), '@khatafy/core': join(web, '../../packages/core/src/index.ts') },
    nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
    define: {
      'import.meta.env.VITE_SUPABASE_URL': '"http://mock.local"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"e2e"',
      'import.meta.env.VITE_ENABLE_GOOGLE': '"true"', 'import.meta.env.VITE_SUPPORT_EMAIL': '"help@example.com"', 'import.meta.env.VITE_COMPANY_NAME': '"Khatafy Labs"', 'import.meta.env.VITE_COMPANY_ADDRESS': '"Lucknow, India"', 'import.meta.env.VITE_GRIEVANCE_OFFICER': '"A. Sharma (help@example.com)"', 'import.meta.env.VITE_JURISDICTION_CITY': '"Lucknow"',
      'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': '"production"',
    },
  });
  let html = readFileSync(join(web, 'index.html'), 'utf8');
  html = html.replace('<script type="module" src="/src/main.tsx"></script>', '<link rel="stylesheet" href="/main.css" /><script type="module" src="/main.js"></script>');
  writeFileSync(join(outDir, 'index.html'), html);
  if (existsSync(join(web, 'public'))) cpSync(join(web, 'public'), outDir, { recursive: true });
  void copyFileSync;
  return outDir;
}
