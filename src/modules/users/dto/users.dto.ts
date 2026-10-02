import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/;

export class CreateUserDto {
  /** 3-50 characters: letters, digits, dot, underscore, dash. Stored in lower case. */
  @Trim()
  @Matches(USERNAME_PATTERN, {
    message: 'Tên đăng nhập gồm 3-50 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
  })
  username: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên là bắt buộc' })
  @MaxLength(120)
  fullName: string;

  @IsEnum(Role)
  role: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  /** Matches username or full name. */
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export interface UserView {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
