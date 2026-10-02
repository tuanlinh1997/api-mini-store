import { execSync } from 'node:child_process';

import { resolveTestDatabaseUrl } from './test-env';

/** Applies all committed migrations to the e2e database once before the suites run. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() },
  });
}
