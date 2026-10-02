import { backupFileName, parseRetentionCount, selectBackupsToDelete } from './backup-files';
import { parseDatabaseUrl, withDatabase } from './database-url';
import { connectionArguments, resolveToolPath } from './mysql-tools';
import { assertRestoreAllowed } from './restore-guard';

describe('parseDatabaseUrl', () => {
  it('extracts host, port, credentials and database', () => {
    expect(parseDatabaseUrl('mysql://app:p%40ss%3Aword@db.local:3307/mini_store?x=1')).toEqual({
      host: 'db.local',
      port: '3307',
      user: 'app',
      password: 'p@ss:word',
      database: 'mini_store',
    });
  });

  it('defaults the port and user and allows an empty password', () => {
    expect(parseDatabaseUrl('mysql://127.0.0.1/mini_store')).toMatchObject({
      port: '3306',
      user: 'root',
      password: '',
    });
  });

  it('rejects other protocols and missing database names', () => {
    expect(() => parseDatabaseUrl('postgres://u@h/db')).toThrow('mysql://');
    expect(() => parseDatabaseUrl('mysql://u@h/')).toThrow('database');
    expect(() => parseDatabaseUrl('not a url')).toThrow('not a valid URL');
  });

  it('points the same server at another database', () => {
    expect(withDatabase('mysql://root:@127.0.0.1:3306/mini_store', 'scratch')).toBe(
      'mysql://root@127.0.0.1:3306/scratch',
    );
  });
});

describe('mysql tool invocation', () => {
  it('never puts the password on the command line', () => {
    const args = connectionArguments({
      host: 'h',
      port: '3306',
      user: 'u',
      password: 'secret',
      database: 'd',
    });
    expect(args).toEqual(['--host=h', '--port=3306', '--user=u']);
    expect(args.join(' ')).not.toContain('secret');
  });

  it('uses MYSQLDUMP_PATH / MYSQL_PATH when set and PATH otherwise', () => {
    expect(resolveToolPath('mysqldump', { MYSQLDUMP_PATH: 'C:/x/mysqldump.exe' })).toBe(
      'C:/x/mysqldump.exe',
    );
    expect(resolveToolPath('mysql', { MYSQL_PATH: '  ' })).toBe('mysql');
    expect(resolveToolPath('mysql', {})).toBe('mysql');
  });
});

describe('backup files', () => {
  it('names backups with a sortable UTC timestamp', () => {
    expect(backupFileName('mini_store', new Date('2026-10-02T03:15:09.123Z'))).toBe(
      'mini_store_20261002T031509Z.sql.gz',
    );
  });

  it('keeps the newest N backups of the database and never touches other files', () => {
    const files = [
      'mini_store_20261001T030000Z.sql.gz',
      'mini_store_20261002T030000Z.sql.gz',
      'mini_store_20261003T030000Z.sql.gz',
      'mini_store_20261004T030000Z.sql.gz',
      'other_db_20250101T030000Z.sql.gz',
      'mini_store_20261005T030000Z.sql.gz.partial',
      'notes.txt',
    ];
    expect(selectBackupsToDelete(files, 'mini_store', 2)).toEqual([
      'mini_store_20261002T030000Z.sql.gz',
      'mini_store_20261001T030000Z.sql.gz',
    ]);
    expect(selectBackupsToDelete(files, 'mini_store', 10)).toEqual([]);
  });

  it('parses the retention count with a default of 14', () => {
    expect(parseRetentionCount(undefined)).toBe(14);
    expect(parseRetentionCount('')).toBe(14);
    expect(parseRetentionCount('7')).toBe(7);
    expect(() => parseRetentionCount('0')).toThrow('BACKUP_RETENTION_COUNT');
    expect(() => parseRetentionCount('abc')).toThrow('BACKUP_RETENTION_COUNT');
  });
});

describe('assertRestoreAllowed', () => {
  const base = {
    targetDatabase: 'scratch_db',
    configuredDatabase: 'mini_store',
    nodeEnvironment: 'development',
    isForced: false,
  };

  it('allows a scratch database', () => {
    expect(() => assertRestoreAllowed(base)).not.toThrow();
  });

  it('refuses the database named in DATABASE_URL unless forced', () => {
    const request = { ...base, targetDatabase: 'mini_store' };
    expect(() => assertRestoreAllowed(request)).toThrow('--force');
    expect(() => assertRestoreAllowed({ ...request, isForced: true })).not.toThrow();
  });

  it('refuses NODE_ENV=production unless forced', () => {
    const request = { ...base, nodeEnvironment: 'production' };
    expect(() => assertRestoreAllowed(request)).toThrow('production');
    expect(() => assertRestoreAllowed({ ...request, isForced: true })).not.toThrow();
  });

  it('rejects target names that could break out of the SQL identifier', () => {
    expect(() =>
      assertRestoreAllowed({ ...base, targetDatabase: 'x`; DROP DATABASE y;--' }),
    ).toThrow('Invalid --target');
  });
});
