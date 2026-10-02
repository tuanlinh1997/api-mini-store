import { ApiProperty } from '@nestjs/swagger';

import { ApiId, ApiTimestamp } from 'src/common/swagger/api-properties';

export class CustomerResponse {
  @ApiId({ example: 1 }) id: number;
  @ApiProperty({ example: 'KH000001', description: 'Generated, KH + 6 digits.' })
  customerCode: string;
  @ApiProperty({ example: 'Trần Thị Bình' }) fullName: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '0901234567',
    description: 'Normalised, 10-11 digits starting with 0.',
  })
  phone: string | null;
  @ApiProperty({ type: String, nullable: true, example: null }) email: string | null;
  @ApiProperty({ type: 'integer', minimum: 0, example: 3, description: 'Loyalty points balance.' })
  loyaltyPoints: number;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}
