import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { Trim, TrimToUndefined } from 'src/common/validation/validation';

import { IsVietnamesePhone } from '../phone';

export class CreateCustomerDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên khách hàng không được để trống' })
  @MaxLength(120)
  fullName: string;

  /** 10-11 digits, may start with 0 or +84. Unique when present. */
  @IsOptional()
  @TrimToUndefined()
  @IsVietnamesePhone()
  phone?: string;

  @IsOptional()
  @TrimToUndefined()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên khách hàng không được để trống' })
  @MaxLength(120)
  fullName?: string;

  /** Send null to clear the phone number. */
  @IsOptional()
  @IsVietnamesePhone()
  phone?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string | null;
}

export class ListCustomersQueryDto extends PaginationQueryDto {
  /** Matches name, phone or customer code. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class LookupCustomerQueryDto {
  /** Customer code or exact phone number. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã khách hàng hoặc số điện thoại' })
  @MaxLength(30)
  q: string;
}
