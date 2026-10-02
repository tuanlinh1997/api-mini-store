import type { OpenAPIObject } from '@nestjs/swagger';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const SPEC_ID = 'openapi-spec';
const JSON_CONTENT_TYPE = 'application/json';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COMPOSITION_KEYWORDS = ['allOf', 'anyOf', 'oneOf'] as const;

/**
 * OpenAPI 3.0 schema -> JSON Schema (draft-07, what ajv validates):
 * - `nullable: true` becomes `anyOf: [{ type: 'null' }, schema]`, so it also works next to `$ref`/`allOf`;
 * - `$ref`s point into the registered spec document;
 * - `example` (documentation only) is dropped;
 * - every object that lists `properties` rejects undeclared properties (`additionalProperties:
 *   false`), so a field the API sends but the contract does not declare is a failure. Members of
 *   `allOf` stay open because they only describe part of the same object.
 */
export function toJsonSchema(node: unknown, isAllOfMember = false): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => toJsonSchema(item));
  }
  if (!isRecord(node)) {
    return node;
  }
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'nullable' || key === 'example') {
      continue;
    }
    if (key === '$ref' && typeof value === 'string') {
      converted.$ref = `${SPEC_ID}${value}`;
    } else if (key === 'properties' && isRecord(value)) {
      converted.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, toJsonSchema(child)]),
      );
    } else if (COMPOSITION_KEYWORDS.some((keyword) => keyword === key) && Array.isArray(value)) {
      converted[key] = value.map((child) => toJsonSchema(child, key === 'allOf'));
    } else if (key === 'items' || key === 'additionalProperties') {
      converted[key] = toJsonSchema(value);
    } else {
      converted[key] = value;
    }
  }
  if (isRecord(node.properties) && !isAllOfMember && node.additionalProperties === undefined) {
    converted.additionalProperties = false;
  }
  return node.nullable === true ? { anyOf: [{ type: 'null' }, converted] } : converted;
}

export interface ContractCheck {
  ok: boolean;
  message: string;
}

/** Validates real HTTP response bodies against the response schemas of an OpenAPI document. */
export class ContractValidator {
  private readonly ajv: Ajv;
  private readonly compiled = new Map<string, ValidateFunction>();

  constructor(private readonly document: OpenAPIObject) {
    this.ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(this.ajv);
    this.ajv.addSchema({
      $id: SPEC_ID,
      components: {
        schemas: Object.fromEntries(
          Object.entries(document.components?.schemas ?? {}).map(([name, schema]) => [
            name,
            toJsonSchema(schema),
          ]),
        ),
      },
    });
  }

  /** Every documented 2xx response as `METHOD /path/{param} status`. */
  documentedSuccessResponses(): string[] {
    return Object.entries(this.document.paths).flatMap(([path, item]) =>
      HTTP_METHODS.flatMap((method) =>
        Object.keys(item[method]?.responses ?? {})
          .filter((status) => status.startsWith('2'))
          .map((status) => `${method.toUpperCase()} ${path} ${status}`),
      ),
    );
  }

  /** Checks `body` against the schema of `method path` for HTTP `status`. */
  check(method: HttpMethod, path: string, status: number, body: unknown): ContractCheck {
    const key = `${method.toUpperCase()} ${path} ${status}`;
    const validate = this.validatorFor(method, path, status);
    if (!validate) {
      return { ok: false, message: `${key}: this status is not documented in the OpenAPI spec` };
    }
    if (validate(body)) {
      return { ok: true, message: key };
    }
    return {
      ok: false,
      message: `${key} does not match the OpenAPI schema:\n${this.ajv.errorsText(validate.errors, {
        separator: '\n',
        dataVar: 'body',
      })}\nbody: ${JSON.stringify(body, null, 2)}`,
    };
  }

  private validatorFor(
    method: HttpMethod,
    path: string,
    status: number,
  ): ValidateFunction | undefined {
    const key = `${method} ${path} ${status}`;
    const cached = this.compiled.get(key);
    if (cached) {
      return cached;
    }
    const response = this.document.paths[path]?.[method]?.responses[String(status)];
    const schema =
      response && !('$ref' in response) ? response.content?.[JSON_CONTENT_TYPE]?.schema : undefined;
    if (!schema) {
      return undefined;
    }
    const jsonSchema = toJsonSchema(schema);
    if (!isRecord(jsonSchema)) {
      return undefined;
    }
    const validate = this.ajv.compile(jsonSchema);
    this.compiled.set(key, validate);
    return validate;
  }
}
