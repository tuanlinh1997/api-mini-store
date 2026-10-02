export interface DatabaseConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

const DEFAULT_MYSQL_PORT = '3306';

/** Parses a mysql:// URL (as in DATABASE_URL) into the parts the MySQL client tools need. */
export function parseDatabaseUrl(databaseUrl: string): DatabaseConnection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid URL (expected mysql://user:password@host:port/db)',
    );
  }
  if (url.protocol !== 'mysql:') {
    throw new Error(`DATABASE_URL must use the mysql:// protocol, got "${url.protocol}//"`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL does not name a database');
  }
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || DEFAULT_MYSQL_PORT,
    user: decodeURIComponent(url.username) || 'root',
    password: decodeURIComponent(url.password),
    database,
  };
}

/** The same server and credentials, pointed at another database. */
export function withDatabase(databaseUrl: string, database: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}
