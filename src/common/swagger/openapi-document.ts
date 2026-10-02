import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  ResponseObject,
  SwaggerModule,
} from '@nestjs/swagger';

import { ErrorCode } from 'src/common/errors/error-codes';

import { ErrorEnvelopeDto, errorResponseSchema } from './envelope.decorators';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const JSON_CONTENT_TYPE = 'application/json';
const ROLES_EXTENSION = 'x-roles';
const ERROR_CODES: readonly string[] = Object.values(ErrorCode);

/** Errors every operation can return, whatever its business rules. */
const ALWAYS_POSSIBLE_ERRORS: Record<number, ErrorCode[]> = {
  429: [ErrorCode.TOO_MANY_REQUESTS],
  500: [ErrorCode.INTERNAL_ERROR],
  503: [ErrorCode.SERVICE_UNAVAILABLE],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value);
}

/** Roles published by `@Roles()` as the `x-roles` extension (absent on public routes). */
function hasRoleRestriction(operation: OperationObject): boolean {
  return ROLES_EXTENSION in operation;
}

function genericErrorsOf(operation: OperationObject): Record<number, ErrorCode[]> {
  const errors: Record<number, ErrorCode[]> = { ...ALWAYS_POSSIBLE_ERRORS };
  if (operation.security && operation.security.length > 0) {
    errors[401] = [ErrorCode.UNAUTHENTICATED];
  }
  if (hasRoleRestriction(operation)) {
    errors[403] = [ErrorCode.FORBIDDEN];
  }
  if ((operation.parameters ?? []).length > 0 || operation.requestBody) {
    errors[400] = [ErrorCode.VALIDATION_ERROR];
  }
  if (operation.requestBody) {
    errors[413] = [ErrorCode.PAYLOAD_TOO_LARGE];
    errors[415] = [ErrorCode.UNSUPPORTED_MEDIA_TYPE];
  }
  return errors;
}

/** Codes already declared by `@ApiErrors` for this response: `allOf[1].properties.code.enum`. */
function declaredCodes(response: ResponseObject | ReferenceObject | undefined): ErrorCode[] {
  if (!response || '$ref' in response) {
    return [];
  }
  const schema = response.content?.[JSON_CONTENT_TYPE]?.schema;
  const narrowing = isRecord(schema) && Array.isArray(schema.allOf) ? schema.allOf[1] : undefined;
  const codeSchema =
    isRecord(narrowing) && isRecord(narrowing.properties) ? narrowing.properties.code : undefined;
  const values = isRecord(codeSchema) && Array.isArray(codeSchema.enum) ? codeSchema.enum : [];
  return values.filter(isErrorCode);
}

/**
 * Adds the errors that apply to (almost) every operation and are not worth repeating in each
 * controller: 401 for authenticated routes, 403 for role-restricted ones, 400 for validated
 * input, 413/415 for bodies, plus 429/500/503. Codes declared with `@ApiErrors` are kept and
 * merged with the generic ones for the same status.
 */
function addGenericErrorResponses(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      for (const [statusText, genericCodes] of Object.entries(genericErrorsOf(operation))) {
        const codes = [
          ...new Set([...declaredCodes(operation.responses[statusText]), ...genericCodes]),
        ];
        operation.responses[statusText] = {
          description: codes.join(', '),
          content: {
            [JSON_CONTENT_TYPE]: { schema: errorResponseSchema(Number(statusText), codes) },
          },
        };
      }
    }
  }
}

/**
 * `details` is an array for some codes and an object for others, so the shared envelope leaves
 * it untyped (a decorator cannot declare "any"); each response then narrows it per error code.
 */
function leaveErrorDetailsUntyped(document: OpenAPIObject): void {
  const properties = document.components?.schemas?.[ErrorEnvelopeDto.name];
  if (properties && 'properties' in properties && properties.properties?.details) {
    properties.properties.details = {
      description: 'Extra context, present only for some codes. Its shape depends on `code`.',
    };
  }
}

/** `Users_list`, `Sales_checkout`: stable, readable names for generated clients. */
function operationIdOf(controllerKey: string, methodKey: string): string {
  return `${controllerKey.replace(/Controller$/, '')}_${methodKey}`;
}

/**
 * The single place that builds the OpenAPI document. It is used by the running app (Swagger UI
 * and /api/docs-json), by `npm run openapi:generate` and by the conformance e2e test, so all of
 * them describe exactly the same contract.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Mini Store API')
    .setDescription(
      [
        'Quản lý siêu thị mini - REST API.',
        'Mọi phản hồi dùng một envelope chung (success / list / error); trường `data` của từng endpoint được mô tả ở đây.',
        'Xác thực bằng Bearer JWT. Hướng dẫn tích hợp: docs/backend/api_integration_guide.md.',
      ].join('\n\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: operationIdOf,
  });
  addGenericErrorResponses(document);
  leaveErrorDetailsUntyped(document);
  return document;
}
