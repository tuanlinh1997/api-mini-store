/** Connection string for the dedicated e2e database (never the dev database). */
export const DEFAULT_TEST_DATABASE_URL = 'mysql://root:@127.0.0.1:3306/mini_store_test';

export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const databaseName = new URL(url).pathname.replace('/', '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests against "${databaseName}": name must end with _test`,
    );
  }
  return url;
}
