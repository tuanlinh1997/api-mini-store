/* `npm run db:restore -- --file=<backup.sql.gz> --target=<database> [--force]`
 * Restores a backup made by `npm run db:backup` into <database> on the server of DATABASE_URL.
 * Refuses the database named in DATABASE_URL, and NODE_ENV=production, unless --force. */
import 'dotenv/config';

import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';

import { DatabaseConnection, parseDatabaseUrl } from './lib/database-url';
import { connectionArguments, runTool } from './lib/mysql-tools';
import { assertRestoreAllowed } from './lib/restore-guard';

const USAGE = 'Usage: npm run db:restore -- --file=<backup.sql.gz> --target=<database> [--force]';

async function createTargetDatabase(target: string, connection: DatabaseConnection): Promise<void> {
  const statement = `CREATE DATABASE IF NOT EXISTS \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
  const run = runTool(
    'mysql',
    [...connectionArguments(connection), '--execute', statement],
    connection,
  );
  run.stdin.end();
  run.stdout.resume();
  await run.completed;
}

async function loadDump(
  filePath: string,
  target: string,
  connection: DatabaseConnection,
): Promise<void> {
  const restore = runTool(
    'mysql',
    [...connectionArguments(connection), '--default-character-set=utf8mb4', target],
    connection,
  );
  restore.stdout.resume();
  const source = createReadStream(filePath);
  const loading = filePath.endsWith('.gz')
    ? pipeline(source, createGunzip(), restore.stdin)
    : pipeline(source, restore.stdin);
  await Promise.all([loading, restore.completed]);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      target: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  });
  if (!values.file || !values.target) {
    throw new Error(USAGE);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const connection = parseDatabaseUrl(databaseUrl);
  assertRestoreAllowed({
    targetDatabase: values.target,
    configuredDatabase: connection.database,
    nodeEnvironment: process.env.NODE_ENV,
    isForced: values.force === true,
  });
  const filePath = path.resolve(values.file);
  await access(filePath);

  await createTargetDatabase(values.target, connection);
  await loadDump(filePath, values.target, connection);
  console.log(`Restored ${filePath} into database "${values.target}".`);
}

main().catch((error: unknown) => {
  console.error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
