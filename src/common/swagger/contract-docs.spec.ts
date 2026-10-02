import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ErrorCode } from 'src/common/errors/error-codes';

/**
 * Guards that keep the committed API contract and its documentation honest. They read the
 * committed files (kept fresh by `npm run openapi:check`), so they need neither a database nor
 * a booted app.
 */
const DOCS_DIRECTORY = join(__dirname, '../../../docs/backend');
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const PUBLIC_OPERATIONS = new Set(['Health_check', 'Auth_login', 'Auth_refresh']);
const NULL_DATA_OPERATIONS = new Set(['Auth_logout', 'Users_resetPassword']);
const ENUM_NAMES = [
  'Role',
  'PurchaseStatus',
  'SaleStatus',
  'PaymentMethod',
  'MovementType',
  'ReferenceType',
];

interface ResponseObject {
  description?: string;
  content?: { 'application/json'?: { schema?: Record<string, unknown> } };
}

interface Operation {
  operationId: string;
  responses: Record<string, ResponseObject>;
  'x-roles'?: string[];
}

interface Spec {
  paths: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], Operation>>>;
  components: { schemas: Record<string, unknown> };
}

function loadSpec(): Spec {
  return JSON.parse(readFileSync(join(DOCS_DIRECTORY, 'openapi.json'), 'utf8')) as Spec;
}

function operationsOf(spec: Spec): { method: string; path: string; operation: Operation }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    HTTP_METHODS.flatMap((method) => {
      const operation = item[method];
      return operation ? [{ method: method.toUpperCase(), path, operation }] : [];
    }),
  );
}

function successSchemaOf(operation: Operation): Record<string, unknown> | undefined {
  const status = Object.keys(operation.responses).find((code) => code.startsWith('2'));
  return status ? operation.responses[status]?.content?.['application/json']?.schema : undefined;
}

function dataSchemaOf(operation: Operation): Record<string, unknown> | undefined {
  const properties = successSchemaOf(operation)?.properties as
    Record<string, Record<string, unknown>> | undefined;
  return properties?.data;
}

describe('committed API contract', () => {
  const spec = loadSpec();
  const operations = operationsOf(spec);
  const guide = readFileSync(join(DOCS_DIRECTORY, 'api_integration_guide.md'), 'utf8');

  it('documents the 55 operations of the API', () => {
    expect(operations).toHaveLength(55);
  });

  it('gives every success response a concrete data schema (a $ref, an array of $ref, or null)', () => {
    const untyped = operations.filter(({ operation }) => {
      const data = dataSchemaOf(operation);
      if (NULL_DATA_OPERATIONS.has(operation.operationId)) {
        return !(data && Array.isArray(data.enum) && data.enum[0] === null);
      }
      const items = data?.items as Record<string, unknown> | undefined;
      return !(data?.$ref || items?.$ref);
    });
    expect(untyped.map(({ method, path }) => `${method} ${path}`)).toEqual([]);
  });

  it('publishes the allowed roles of every non-public operation as x-roles', () => {
    const missing = operations.filter(
      ({ operation }) => !PUBLIC_OPERATIONS.has(operation.operationId) && !operation['x-roles'],
    );
    expect(missing.map(({ method, path }) => `${method} ${path}`)).toEqual([]);
  });

  it('declares the shared enums as named schemas', () => {
    expect(Object.keys(spec.components.schemas)).toEqual(expect.arrayContaining(ENUM_NAMES));
  });

  it('only lists real error codes in error responses', () => {
    const known = new Set<string>(Object.values(ErrorCode));
    const unknown = operations.flatMap(({ operation }) =>
      Object.entries(operation.responses)
        .filter(([status]) => status !== 'default' && !status.startsWith('2'))
        .flatMap(([, response]) => (response.description ?? '').split(', '))
        .filter((code) => code !== '' && !known.has(code)),
    );
    expect(unknown).toEqual([]);
  });

  it('lists every operation in the integration guide reference table', () => {
    const missing = operations
      .filter(
        ({ method, path }) =>
          !guide.includes(`| \`${method}\` | \`${path.replace('/api/v1', '')}\` |`),
      )
      .map(({ method, path }) => `${method} ${path}`);
    expect(missing).toEqual([]);
  });

  it('explains every error code in the integration guide catalogue', () => {
    const missing = Object.values(ErrorCode).filter(
      (code) => !new RegExp(`\\| \`${code}\` \\|`).test(guide),
    );
    expect(missing).toEqual([]);
  });
});
