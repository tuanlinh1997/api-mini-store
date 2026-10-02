/* `npm run db:compare -- --source=<database> --target=<database>`
 * Compares exact row counts of every table in two databases on the server of DATABASE_URL.
 * Used to confirm a restore is complete. Exit code 1 when any table differs. */
import 'dotenv/config';

import { parseArgs } from 'node:util';

import { PrismaClient } from '@prisma/client';

import { withDatabase } from './lib/database-url';

const USAGE = 'Usage: npm run db:compare -- --source=<database> --target=<database>';

async function countRows(databaseUrl: string): Promise<Map<string, number>> {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const tables = await prisma.$queryRawUnsafe<{ tableName: string }[]>(
      'SELECT table_name AS tableName FROM information_schema.tables ' +
        "WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
    );
    const counts = new Map<string, number>();
    for (const { tableName } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        `SELECT COUNT(*) AS total FROM \`${tableName}\``,
      );
      counts.set(tableName, Number(rows[0]?.total ?? 0));
    }
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { source: { type: 'string' }, target: { type: 'string' } },
  });
  const databaseUrl = process.env.DATABASE_URL;
  if (!values.source || !values.target || !databaseUrl) {
    throw new Error(USAGE);
  }
  const source = await countRows(withDatabase(databaseUrl, values.source));
  const target = await countRows(withDatabase(databaseUrl, values.target));

  const tableNames = [...new Set([...source.keys(), ...target.keys()])].sort();
  let mismatches = 0;
  console.log(
    `${'table'.padEnd(24)} ${values.source.padStart(14)} ${values.target.padStart(14)}  result`,
  );
  for (const tableName of tableNames) {
    const sourceCount = source.get(tableName);
    const targetCount = target.get(tableName);
    const isEqual = sourceCount === targetCount;
    mismatches += isEqual ? 0 : 1;
    console.log(
      `${tableName.padEnd(24)} ${String(sourceCount ?? '-').padStart(14)} ${String(targetCount ?? '-').padStart(14)}  ${isEqual ? 'OK' : 'MISMATCH'}`,
    );
  }
  console.log(
    mismatches === 0
      ? `\nAll ${tableNames.length} tables have identical row counts.`
      : `\n${mismatches} of ${tableNames.length} tables differ.`,
  );
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Compare failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
