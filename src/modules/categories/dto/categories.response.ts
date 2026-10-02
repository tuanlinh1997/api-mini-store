import { ApiProperty } from '@nestjs/swagger';

import { ApiId, ApiTimestamp } from 'src/common/swagger/api-properties';

export class CategoryResponse {
  @ApiId({ example: 7 }) id: number;
  @ApiProperty({ example: 'Đồ uống' }) name: string;
  @ApiProperty({ type: String, nullable: true, example: null }) description: string | null;
  @ApiProperty({ type: Boolean, example: true }) isActive: boolean;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}
