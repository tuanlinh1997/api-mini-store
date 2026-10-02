import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { ApiSearchFilter } from 'src/common/swagger/api-properties';
import { Trim, TrimToUndefined } from 'src/common/validation/validation';

import { IsVietnamesePhone } from '../phone';

const CUSTOMER_PHONE_DESCRIPTION =
  '10-11 digits starting with 0; +84 / 84 prefixes and spaces are normalised. Unique.';

export class CreateCustomerDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Trần Thị Bình' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên khách hàng không được để trống' })
  @MaxLength(120)
  fullName: string;

  /** 10-11 digits, may start with 0 or +84. Unique when present. */
  @ApiPropertyOptional({ example: '0901234567', description: CUSTOMER_PHONE_DESCRIPTION })
  @IsOptional()
  @TrimToUndefined()
  @IsVietnamesePhone()
  phone?: string;

  @ApiPropertyOptional({ format: 'email', maxLength: 255, example: 'binh@example.com' })
  @IsOptional()
  @TrimToUndefined()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, example: 'Trần Thị Bình' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên khách hàng không được để trống' })
  @MaxLength(120)
  fullName?: string;

  /** Send null to clear the phone number. */
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '0901234567',
    description: `${CUSTOMER_PHONE_DESCRIPTION} null clears it.`,
  })
  @IsOptional()
  @IsVietnamesePhone()
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
}

export class ListCustomersQueryDto extends PaginationQueryDto {
  /** Matches name, phone or customer code. */
  @ApiSearchFilter('Matches name, phone or customer code (partial).')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class LookupCustomerQueryDto {
  /** Customer code or exact phone number. */
  @ApiProperty({
    minLength: 1,
    maxLength: 30,
    example: '0901234567',
    description: 'Customer code (KH000001) or exact phone number.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã khách hàng hoặc số điện thoại' })
  @MaxLength(30)
  q: string;
}
