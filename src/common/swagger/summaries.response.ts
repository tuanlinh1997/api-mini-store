import { ApiProperty } from '@nestjs/swagger';

import { ApiId } from './api-properties';

/** Small embedded references used by several responses. */
export class CategorySummaryResponse {
  @ApiId({ example: 7 }) id: number;
  @ApiProperty({ example: 'Đồ uống' }) name: string;
}

export class SupplierSummaryResponse {
  @ApiId({ example: 3 }) id: number;
  @ApiProperty({ example: 'Công ty Phân phối ABC' }) name: string;
}

export class StaffSummaryResponse {
  @ApiId({ example: 2 }) id: number;
  @ApiProperty({ example: 'Nguyễn Văn An' }) fullName: string;
}

export class ProductSummaryResponse {
  @ApiId({ example: 14 }) id: number;
  @ApiProperty({ example: 'COCA-330' }) sku: string;
  @ApiProperty({ example: 'Coca-Cola lon 330ml' }) name: string;
  @ApiProperty({ example: 'lon' }) unit: string;
}

export class CustomerSummaryResponse {
  @ApiId({ example: 1 }) id: number;
  @ApiProperty({ example: 'KH000001' }) customerCode: string;
  @ApiProperty({ example: 'Trần Thị Bình' }) fullName: string;
}
