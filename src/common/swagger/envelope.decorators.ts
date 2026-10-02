import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import {
  ApiDefaultResponse,
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

/** Documentation-only models: they describe the runtime envelope built by the interceptor/filter. */
export class PageMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) pageSize: number;
  @ApiProperty({ example: 134 }) total: number;
}

export class SuccessEnvelopeDto {
  @ApiProperty({ type: Boolean, example: true }) success: true;
  @ApiProperty({ example: 200 }) statusCode: number;
  @ApiProperty({ example: 'OK' }) code: string;
  @ApiProperty({ example: 'Thành công' }) message: string;
  @ApiProperty({ type: Object, description: 'Payload; an array for list endpoints.' })
  data: unknown;
  @ApiPropertyOptional({ type: PageMetaDto, description: 'Only on list endpoints.' })
  meta?: PageMetaDto;
  @ApiProperty({ example: '6859fec4-4a9a-4af0-bf53-c9f03c774f0b' }) requestId: string;
  @ApiProperty({ example: '2026-10-02T04:50:53.609Z' }) timestamp: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: Boolean, example: false }) success: false;
  @ApiProperty({ example: 409 }) statusCode: number;
  @ApiProperty({ example: 'INSUFFICIENT_STOCK' }) code: string;
  @ApiProperty({ example: 'Không đủ tồn kho cho một số sản phẩm.' }) message: string;
  @ApiProperty({ type: Object, nullable: true, example: null }) data: null;
  @ApiPropertyOptional({
    type: Object,
    description: 'Extra context, e.g. field errors or stock availability.',
  })
  details?: unknown;
  @ApiProperty({ example: '6859fec4-4a9a-4af0-bf53-c9f03c774f0b' }) requestId: string;
  @ApiProperty({ example: '2026-10-02T04:50:53.609Z' }) timestamp: string;
}

interface EnvelopeOptions {
  /** Class describing one item (or the object) in `data`; omit when there is no class. */
  model?: Type<unknown>;
  status?: number;
  description?: string;
}

function dataSchema(model: Type<unknown> | undefined, isArray: boolean): Record<string, unknown> {
  const item = model ? { $ref: getSchemaPath(model) } : { type: 'object' };
  return isArray ? { type: 'array', items: item } : item;
}

function envelopeResponse(
  options: EnvelopeOptions,
  isArray: boolean,
  withMeta: boolean,
): MethodDecorator & ClassDecorator {
  const extraModels: Type<unknown>[] = [SuccessEnvelopeDto, PageMetaDto];
  if (options.model) {
    extraModels.push(options.model);
  }
  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(SuccessEnvelopeDto) },
          {
            properties: {
              data: dataSchema(options.model, isArray),
              ...(withMeta ? { meta: { $ref: getSchemaPath(PageMetaDto) } } : {}),
            },
          },
        ],
      },
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

/** Class-level: every error of the controller uses the standard error envelope. */
export const ApiEnvelopedController = (): ClassDecorator =>
  applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ApiDefaultResponse({ description: 'Error envelope', type: ErrorEnvelopeDto }),
  );
