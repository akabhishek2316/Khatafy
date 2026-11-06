// Runs the E2E journeys. Requires: PostgreSQL reachable (PGHOST/PGPORT/PGUSER), `npx playwright install chromium`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync('npx', ['tsx', '--test', '--test-concurrency=1', join(here, 'journeys.test.ts')], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
