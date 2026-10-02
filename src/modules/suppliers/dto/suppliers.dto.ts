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
import { ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

const CONTACT_PHONE_PATTERN = /^[0-9+().\-\s]{6,20}$/;

export class CreateSupplierDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @MaxLength(200)
  name: string;

  @IsOptional()
  @TrimToUndefined()
  @Matches(CONTACT_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @IsOptional()
  @TrimToUndefined()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Matches(CONTACT_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
  phone?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ListSuppliersQueryDto extends PaginationQueryDto {
  /** Matches name, phone or email. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
