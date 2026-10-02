import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { ApiBooleanFilter, ApiSearchFilter } from 'src/common/swagger/api-properties';
import { ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

const CONTACT_PHONE_PATTERN = /^[0-9+().\-\s]{6,20}$/;
const PHONE_SCHEMA = {
  minLength: 6,
  maxLength: 20,
  pattern: CONTACT_PHONE_PATTERN.source,
  example: '0281234567',
};

export class CreateSupplierDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Công ty Phân phối ABC' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional(PHONE_SCHEMA)
  @IsOptional()
  @TrimToUndefined()
  @Matches(CONTACT_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 255, example: 'abc@example.com' })
  @IsOptional()
  @TrimToUndefined()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200, example: 'Công ty Phân phối ABC' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    ...PHONE_SCHEMA,
    type: String,
    nullable: true,
    description: 'null clears it.',
  })
  @IsOptional()
  @Matches(CONTACT_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'email',
    maxLength: 255,
    description: 'null clears it.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 500,
    description: 'null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 1000,
    description: 'null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  /** Matches name, phone or email. */
  @ApiSearchFilter('Matches name, phone or email (partial).')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiBooleanFilter('Filter by active state; omit for all.')
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
