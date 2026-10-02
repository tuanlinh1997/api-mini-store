/* `npm run openapi:generate`  writes docs/backend/openapi.json from the module metadata.
 * `npm run openapi:check`     exits 1 when openapi.json or api-types.ts is stale.
 *
 * No database is needed: the Nest app is created (providers are constructed) but never
 * initialised, so no connection is opened. The document comes from buildOpenApiDocument(),
 * the same function the running app and the conformance test use. */
import 'reflect-metadata';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SPEC_PATH = resolve(__dirname, '../docs/backend/openapi.json');
const TYPES_PATH = resolve(__dirname, '../docs/backend/api-types.ts');

/** Deterministic, harmless values: nothing here can reach a real database or secret. */
function useOfflineEnvironment(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://offline:offline@127.0.0.1:1/openapi_export',
    JWT_ACCESS_SECRET: 'openapi-export-only-secret-not-used-at-runtime-0123456789',
    LOG_LEVEL: 'silent',
    SWAGGER_ENABLED: 'false',
    SESSION_CLEANUP_ENABLED: 'false',
    CORS_ORIGINS: '',
  });
}

export async function generateOpenApiJson(): Promise<string> {
  useOfflineEnvironment();
  // Imported after the environment is set: ConfigModule validates it while AppModule loads.
  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('src/app.module');
  const { GLOBAL_PREFIX } = await import('src/app.setup');
  const { buildOpenApiDocument } = await import('src/common/swagger/openapi-document');

  const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
  try {
    app.setGlobalPrefix(GLOBAL_PREFIX);
    return `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
  } finally {
    await app.close();
  }
}

function openApiTypescriptCli(): string {
  const packageRoot = dirname(require.resolve('openapi-typescript/package.json'));
  return join(packageRoot, 'bin', 'cli.js');
}

function generateTypes(specPath: string, outputPath: string): void {
  execFileSync(process.execPath, [openApiTypescriptCli(), specPath, '-o', outputPath], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function normalised(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function readIfPresent(path: string): string {
  try {
    return normalised(readFileSync(path, 'utf8'));
  } catch {
    return '';
  }
}

function checkFresh(specJson: string): string[] {
  const stale: string[] = [];
  if (readIfPresent(SPEC_PATH) !== normalised(specJson)) {
    stale.push('docs/backend/openapi.json');
  }
  const workDir = mkdtempSync(join(tmpdir(), 'openapi-check-'));
  try {
    const specCopy = join(workDir, 'openapi.json');
    const typesCopy = join(workDir, 'api-types.ts');
    writeFileSync(specCopy, specJson);
    generateTypes(specCopy, typesCopy);
    if (readIfPresent(TYPES_PATH) !== readIfPresent(typesCopy)) {
      stale.push('docs/backend/api-types.ts');
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  return stale;
}

async function main(): Promise<void> {
  const specJson = await generateOpenApiJson();
  if (process.argv.includes('--check')) {
    const stale = checkFresh(specJson);
    if (stale.length > 0) {
      console.error(
        `The committed API contract is stale: ${stale.join(', ')}.\nRun \`npm run openapi:export\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log('OpenAPI contract is up to date.');
    return;
  }
  writeFileSync(SPEC_PATH, specJson);
  console.log(`Wrote ${SPEC_PATH}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
