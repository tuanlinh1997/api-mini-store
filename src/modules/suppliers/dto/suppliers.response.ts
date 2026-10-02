import { ApiProperty } from '@nestjs/swagger';

import { ApiId, ApiTimestamp } from 'src/common/swagger/api-properties';

export class SupplierResponse {
  @ApiId({ example: 3 }) id: number;
  @ApiProperty({ example: 'Công ty Phân phối ABC' }) name: string;
  @ApiProperty({ type: String, nullable: true, example: '0281234567' }) phone: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'abc@example.com' }) email: string | null;
  @ApiProperty({ type: String, nullable: true, example: null }) address: string | null;
  @ApiProperty({ type: String, nullable: true, example: null }) note: string | null;
  @ApiProperty({ type: Boolean, example: true }) isActive: boolean;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}
