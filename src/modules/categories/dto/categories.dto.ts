import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from 'src/common/pagination/pagination';
import { ApiBooleanFilter, ApiSearchFilter } from 'src/common/swagger/api-properties';
import { ToBoolean, Trim, TrimToUndefined } from 'src/common/validation/validation';

export class CreateCategoryDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Đồ uống', description: 'Unique.' })
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ maxLength: 500, example: 'Nước ngọt, nước suối' })
  @IsOptional()
  @TrimToUndefined()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, example: 'Đồ uống' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 500,
    description: 'Send null to clear the description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class ListCategoriesQueryDto extends PaginationQueryDto {
  @ApiSearchFilter('Matches the category name.')
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
