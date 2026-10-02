import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { ApiBooleanFilter, ApiSearchFilter } from 'src/common/swagger/api-properties';
import { ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/;

const ROLE_ENUM = { enum: Role, enumName: 'Role' } as const;

export class CreateUserDto {
  /** 3-50 characters: letters, digits, dot, underscore, dash. Stored in lower case. */
  @ApiProperty({
    minLength: 3,
    maxLength: 50,
    pattern: '^[a-zA-Z0-9._-]{3,50}$',
    example: 'cashier02',
    description: 'Unique, stored in lower case.',
  })
  @Trim()
  @Matches(USERNAME_PATTERN, {
    message: 'Tên đăng nhập gồm 3-50 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang',
  })
  username: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;

  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Nguyễn Văn An' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Họ tên là bắt buộc' })
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ ...ROLE_ENUM, example: Role.CASHIER })
  @IsEnum(Role)
  role: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, example: 'Nguyễn Văn An' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ ...ROLE_ENUM, description: 'Cannot demote the last active admin.' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class ResetPasswordDto {
  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  /** Matches username or full name. */
  @ApiSearchFilter('Matches username or full name.')
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ ...ROLE_ENUM })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiBooleanFilter('false lists locked accounts.')
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
