import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import {
  ApiDefaultResponse,
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger';

import { ErrorCode } from 'src/common/errors/error-codes';

import { ERROR_DETAIL_MODELS, ERROR_DETAIL_SCHEMAS } from './error-details.models';

type JsonSchema = SchemaObject | ReferenceObject;

/** Pagination block of every list response (top-level `meta`). */
export class PageMetaDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 }) page: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 100, example: 20 }) pageSize: number;
  @ApiProperty({ type: 'integer', minimum: 0, example: 134, description: 'Total matching items.' })
  total: number;
}

/**
 * Documentation-only model of the error envelope built by the exception filter. Endpoints
 * narrow `statusCode`, `code` and `details` per response via `@ApiErrors`.
 */
export class ErrorEnvelopeDto {
  @ApiProperty({ type: Boolean, enum: [false], example: false }) success: false;
  @ApiProperty({ type: 'integer', example: 409 }) statusCode: number;
  @ApiProperty({ enum: ErrorCode, enumName: 'ErrorCode', example: ErrorCode.INSUFFICIENT_STOCK })
  code: ErrorCode;
  @ApiProperty({
    example: 'Không đủ tồn kho cho một số sản phẩm.',
    description: 'Vietnamese, safe to show to the user.',
  })
  message: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    enum: [null],
    description: 'Always null on errors.',
  })
  data: null;
  @ApiPropertyOptional({
    description:
      'Extra context, present only for some codes: validation issues, stock availability, ...',
  })
  details?: unknown;
  @ApiProperty({
    example: '6859fec4-4a9a-4af0-bf53-c9f03c774f0b',
    description: 'Quote it when reporting a problem.',
  })
  requestId: string;
  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-02T04:50:53.609Z' })
  timestamp: string;
}

interface EnvelopeOptions {
  /** Class describing one item (or the object) in `data`; omit when `data` is `null`. */
  model?: Type<unknown>;
  status?: number;
  description?: string;
}

const SUCCESS_MESSAGE_EXAMPLE = 'Thành công';

function dataSchema(model: Type<unknown> | undefined, isArray: boolean): JsonSchema {
  if (!model) {
    return { nullable: true, enum: [null], description: 'Always null.' };
  }
  const item: ReferenceObject = { $ref: getSchemaPath(model) };
  return isArray ? { type: 'array', items: item } : item;
}

/** Inline (no allOf) so every operation has `data` and `meta` spelled out for code generators. */
function successSchema(status: number, data: JsonSchema, withMeta: boolean): SchemaObject {
  return {
    type: 'object',
    required: [
      'success',
      'statusCode',
      'code',
      'message',
      'data',
      ...(withMeta ? ['meta'] : []),
      'requestId',
      'timestamp',
    ],
    properties: {
      success: { type: 'boolean', enum: [true] },
      statusCode: { type: 'integer', enum: [status] },
      code: { type: 'string', enum: ['OK'] },
      message: { type: 'string', example: SUCCESS_MESSAGE_EXAMPLE },
      data,
      ...(withMeta ? { meta: { $ref: getSchemaPath(PageMetaDto) } } : {}),
      requestId: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
    },
  };
}

function envelopeResponse(
  options: EnvelopeOptions,
  isArray: boolean,
  withMeta: boolean,
): MethodDecorator & ClassDecorator {
  const status = options.status ?? HttpStatus.OK;
  const extraModels: Type<unknown>[] = [PageMetaDto];
  if (options.model) {
    extraModels.push(options.model);
  }
  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiResponse({
      status,
      description: options.description,
      schema: successSchema(status, dataSchema(options.model, isArray), withMeta),
    }),
  );
}

/** Documents a success response wrapped in the standard envelope (`data` = one object). */
export const ApiOkEnvelope = (options: EnvelopeOptions = {}): MethodDecorator & ClassDecorator =>
  envelopeResponse(options, false, false);

/** Documents a list response: `data` = array of items, plus top-level pagination `meta`. */
export const ApiPaginatedEnvelope = (
  options: EnvelopeOptions = {},
): MethodDecorator & ClassDecorator => envelopeResponse(options, true, true);

/** HTTP status -> error codes the endpoint can answer with that status. */
export type ErrorCodesByStatus = Partial<Record<number, readonly ErrorCode[]>>;

/** Error response for `status`, narrowed to the given codes (and their `details` shapes). */
export function errorResponseSchema(status: number, codes: readonly ErrorCode[]): SchemaObject {
  const detailSchemas = [
    ...new Map(
      codes.flatMap((code) => {
        const schema = ERROR_DETAIL_SCHEMAS[code];
        return schema ? [[JSON.stringify(schema), schema] as const] : [];
      }),
    ).values(),
  ];
  const properties: Record<string, JsonSchema> = {
    statusCode: { type: 'integer', enum: [status] },
    code: { type: 'string', enum: [...codes] },
  };
  const [firstDetailSchema] = detailSchemas;
  if (firstDetailSchema) {
    properties.details = detailSchemas.length === 1 ? firstDetailSchema : { anyOf: detailSchemas };
  }
  return {
    allOf: [
      { $ref: getSchemaPath(ErrorEnvelopeDto) },
      {
        type: 'object',
        required: ['statusCode', 'code'],
        properties,
      },
    ],
  };
}

/**
 * Lists the error codes an endpoint can return per HTTP status, e.g.
 * `@ApiErrors({ 404: [ErrorCode.SALE_NOT_FOUND] })`. Generic errors (401, 403, 400 validation,
 * 429, 5xx) are added to every operation by `buildOpenApiDocument`.
 */
export const ApiErrors = (errors: ErrorCodesByStatus): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto, ...ERROR_DETAIL_MODELS),
    ...Object.entries(errors).map(([status, codes]) =>
      ApiResponse({
        status: Number(status),
        description: (codes ?? []).join(', '),
        schema: errorResponseSchema(Number(status), codes ?? []),
      }),
    ),
  );

/** Class-level: registers the error models and a catch-all error response. */
export const ApiEnvelopedController = (): ClassDecorator =>
  applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto, ...ERROR_DETAIL_MODELS),
    ApiDefaultResponse({ description: 'Error envelope', type: ErrorEnvelopeDto }),
  );
