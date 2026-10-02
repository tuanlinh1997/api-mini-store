import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import {
  ApiIdFilter,
  ApiMoneyInput,
  ApiSearchFilter,
  ApiStoreDate,
} from 'src/common/swagger/api-properties';
import { IsIsoDate, IsMoneyAmount, TrimToUndefined } from 'src/common/validation/validation';

const MAX_PURCHASE_LINES = 200;
const MAX_LINE_QUANTITY = 1_000_000;

export class PurchaseItemDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 14,
    description: 'Must exist and be active; one line per product.',
  })
  @IsInt()
  @Min(1)
  productId: number;

  /** Whole units only (BR4). */
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: MAX_LINE_QUANTITY,
    example: 10,
    description: 'Whole units only.',
  })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  @Max(MAX_LINE_QUANTITY)
  quantity: number;

  @ApiMoneyInput({ description: 'Purchase price per unit in VND', example: 7500 })
  @IsMoneyAmount()
  unitCost: number;
}

export class CreatePurchaseDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 3,
    description: 'Must exist and be active.',
  })
  @IsInt()
  @Min(1)
  supplierId: number;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Giao buổi sáng' })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ type: [PurchaseItemDto], minItems: 1, maxItems: MAX_PURCHASE_LINES })
  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất một mặt hàng' })
  @ArrayMaxSize(MAX_PURCHASE_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  /** Create and receive in one transaction. */
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'true: create and receive in one transaction (status RECEIVED).',
  })
  @IsOptional()
  @IsBoolean()
  receiveNow?: boolean;
}

export class UpdatePurchaseDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    example: 3,
    description: 'Must exist and be active.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  /** Send null to clear the note. */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 1000,
    description: 'null clears the note.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  /** When present, replaces all lines of the draft. */
  @ApiPropertyOptional({
    type: [PurchaseItemDto],
    minItems: 1,
    maxItems: MAX_PURCHASE_LINES,
    description: 'When present, replaces ALL lines of the draft.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Phiếu nhập phải có ít nhất một mặt hàng' })
  @ArrayMaxSize(MAX_PURCHASE_LINES)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class ListPurchasesQueryDto extends PaginationQueryDto {
  /** Matches the purchase number. */
  @ApiSearchFilter('Matches the purchase number (partial).', 30)
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(30)
  search?: string;

  @ApiPropertyOptional({ enum: PurchaseStatus, enumName: 'PurchaseStatus' })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @ApiIdFilter('Only purchases of this supplier.')
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;

  @ApiStoreDate({ optional: true, description: 'First creation day' })
  @IsOptional()
  @IsIsoDate()
  from?: string;

  @ApiStoreDate({
    optional: true,
    description: 'Last creation day, inclusive',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsIsoDate()
  to?: string;
}
