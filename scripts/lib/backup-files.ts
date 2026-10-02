const BACKUP_EXTENSION = '.sql.gz';
const TIMESTAMP_PATTERN = /^\d{8}T\d{6}Z$/;
const DEFAULT_RETENTION_COUNT = 14;

/** mini_store + 2026-10-02T03:15:00Z -> mini_store_20261002T031500Z.sql.gz (sortable by name). */
export function backupFileName(database: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${database}_${stamp}${BACKUP_EXTENSION}`;
}

function isBackupOf(database: string, fileName: string): boolean {
  const prefix = `${database}_`;
  if (!fileName.startsWith(prefix) || !fileName.endsWith(BACKUP_EXTENSION)) {
    return false;
  }
  return TIMESTAMP_PATTERN.test(fileName.slice(prefix.length, -BACKUP_EXTENSION.length));
}

/**
 * Backups to delete so that only the newest `keepCount` of this database remain.
 * Files that do not look like our backups are never returned, so a stray file is safe.
 */
export function selectBackupsToDelete(
  fileNames: readonly string[],
  database: string,
  keepCount: number,
): string[] {
  return fileNames
    .filter((fileName) => isBackupOf(database, fileName))
    .sort()
    .reverse()
    .slice(keepCount);
}

export function parseRetentionCount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RETENTION_COUNT;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`BACKUP_RETENTION_COUNT must be a positive integer, got "${raw}"`);
  }
  return value;
}
