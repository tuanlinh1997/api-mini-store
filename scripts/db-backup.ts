/* `npm run db:backup`: gzipped, timestamped mysqldump of the database named in DATABASE_URL,
 * then pruning down to the newest BACKUP_RETENTION_COUNT files. See docs/backend/BACKEND.md. */
import 'dotenv/config';

import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { backupFileName, parseRetentionCount, selectBackupsToDelete } from './lib/backup-files';
import { parseDatabaseUrl } from './lib/database-url';
import { connectionArguments, runTool } from './lib/mysql-tools';

const DEFAULT_BACKUP_DIR = './backups';
const BYTES_PER_KIBIBYTE = 1024;

async function pruneOldBackups(
  directory: string,
  database: string,
  keepCount: number,
): Promise<string[]> {
  const toDelete = selectBackupsToDelete(await readdir(directory), database, keepCount);
  await Promise.all(toDelete.map((fileName) => unlink(path.join(directory, fileName))));
  return toDelete;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const connection = parseDatabaseUrl(databaseUrl);
  const directory = path.resolve(process.env.BACKUP_DIR?.trim() || DEFAULT_BACKUP_DIR);
  const keepCount = parseRetentionCount(process.env.BACKUP_RETENTION_COUNT);
  await mkdir(directory, { recursive: true });

  const finalPath = path.join(directory, backupFileName(connection.database, new Date()));
  const partialPath = `${finalPath}.partial`;
  const dump = runTool(
    'mysqldump',
    [
      ...connectionArguments(connection),
      '--single-transaction',
      '--routines',
      '--triggers',
      '--set-gtid-purged=OFF',
      '--no-tablespaces',
      '--default-character-set=utf8mb4',
      connection.database,
    ],
    connection,
  );
  dump.stdin.end();
  try {
    // Write to a .partial file so a failed dump can never be mistaken for a good backup.
    await Promise.all([
      pipeline(dump.stdout, createGzip(), createWriteStream(partialPath)),
      dump.completed,
    ]);
    await rename(partialPath, finalPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }

  const { size } = await stat(finalPath);
  const pruned = await pruneOldBackups(directory, connection.database, keepCount);
  console.log(`Backup written: ${finalPath} (${Math.round(size / BYTES_PER_KIBIBYTE)} KiB)`);
  console.log(
    `Retention: keeping the newest ${keepCount}; removed ${pruned.length} old backup(s).`,
  );
  for (const fileName of pruned) {
    console.log(`  removed ${fileName}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
