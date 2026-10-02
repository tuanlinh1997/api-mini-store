import { ApiProperty, ApiPropertyOptional, ReferenceObject, SchemaObject } from '@nestjs/swagger';

import { ErrorCode } from 'src/common/errors/error-codes';

/** Why a cart line cannot be sold (`PRODUCT_UNAVAILABLE` on checkout). */
export enum UnavailableReason {
  INACTIVE = 'INACTIVE',
  NOT_FOUND = 'NOT_FOUND',
}

/** `details` item of `VALIDATION_ERROR`: one entry per invalid field. */
export class FieldIssueDto {
  @ApiProperty({ example: 'items.0.quantity', description: 'Dotted path of the invalid field.' })
  field: string;

  @ApiProperty({ type: [String], example: ['Số lượng phải lớn hơn 0'] })
  messages: string[];
}

/** `details` item of `INSUFFICIENT_STOCK` (409): one entry per product that is short. */
export class StockShortageDto {
  @ApiProperty({ type: 'integer', example: 14 }) productId: number;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiProperty({ type: Number, example: 9999, description: 'Quantity in the cart.' })
  requested: number;
  @ApiProperty({ type: Number, example: 93, description: 'Quantity currently in stock.' })
  available: number;
}

/** `details` item of `PRODUCT_UNAVAILABLE` (422). */
export class UnavailableProductDto {
  @ApiProperty({ type: 'integer', example: 14 }) productId: number;

  @ApiPropertyOptional({
    enum: UnavailableReason,
    enumName: 'UnavailableReason',
    description: 'Present on checkout only; purchase receiving lists just the product ids.',
  })
  reason?: UnavailableReason;
}

/** `details` of `STOCK_CONFLICT` (409). */
export class StockConflictDetailsDto {
  @ApiProperty({ type: 'integer', example: 1 }) productId: number;
  @ApiProperty({ type: Number, example: 10, description: 'The stock the user saw.' })
  expectedSystemQty: number;
  @ApiProperty({ type: Number, example: 8, description: 'The stock right now.' })
  currentStockQty: number;
}

/** `details` of `INVALID_DISCOUNT` (422); which fields are present depends on the violated rule. */
export class DiscountLimitDetailsDto {
  @ApiPropertyOptional({
    type: Number,
    example: 40000,
    description: 'Present when discount >= subtotal.',
  })
  subtotal?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 10,
    description: 'Role limit, in percent of the subtotal.',
  })
  maxDiscountPercent?: number;

  @ApiPropertyOptional({ type: Number, example: 4000, description: 'Role limit as a VND amount.' })
  maxDiscountAmount?: number;
}

/** `details` of `INVALID_PAYMENT` (422) when the payments do not add up to the total. */
export class PaymentTotalsDetailsDto {
  @ApiPropertyOptional({ type: Number, example: 36000 }) total?: number;
  @ApiPropertyOptional({ type: Number, example: 30000 }) paid?: number;
}

/** `details` of `INVALID_PURCHASE_LINE` (422). */
export class PurchaseLineIssueDto {
  @ApiPropertyOptional({ type: 'integer', example: 3 }) productId?: number;
}

/** `details` of `DUPLICATE_VALUE` (409). */
export class DuplicateValueDetailsDto {
  @ApiPropertyOptional({
    description:
      'Violated unique index (MySQL index name) or list of columns, as reported by the database.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  fields?: string | string[];
}

export const ERROR_DETAIL_MODELS = [
  FieldIssueDto,
  StockShortageDto,
  UnavailableProductDto,
  StockConflictDetailsDto,
  DiscountLimitDetailsDto,
  PaymentTotalsDetailsDto,
  PurchaseLineIssueDto,
  DuplicateValueDetailsDto,
] as const;

const refTo = (model: { name: string }): ReferenceObject => ({
  $ref: `#/components/schemas/${model.name}`,
});

const arrayOf = (model: { name: string }): SchemaObject => ({
  type: 'array',
  items: refTo(model),
});

/** Shape of `details` for the error codes that carry structured context. */
export const ERROR_DETAIL_SCHEMAS: Partial<Record<ErrorCode, SchemaObject | ReferenceObject>> = {
  [ErrorCode.VALIDATION_ERROR]: arrayOf(FieldIssueDto),
  [ErrorCode.INSUFFICIENT_STOCK]: arrayOf(StockShortageDto),
  [ErrorCode.PRODUCT_UNAVAILABLE]: arrayOf(UnavailableProductDto),
  [ErrorCode.STOCK_CONFLICT]: refTo(StockConflictDetailsDto),
  [ErrorCode.INVALID_DISCOUNT]: refTo(DiscountLimitDetailsDto),
  [ErrorCode.INVALID_PAYMENT]: refTo(PaymentTotalsDetailsDto),
  [ErrorCode.INVALID_PURCHASE_LINE]: refTo(PurchaseLineIssueDto),
  [ErrorCode.DUPLICATE_VALUE]: refTo(DuplicateValueDetailsDto),
};
