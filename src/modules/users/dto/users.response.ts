import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ApiId, ApiTimestamp } from 'src/common/swagger/api-properties';

export class UserResponse {
  @ApiId({ example: 2 }) id: number;
  @ApiProperty({ example: 'cashier' }) username: string;
  @ApiProperty({ example: 'Nguyễn Văn An' }) fullName: string;
  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.CASHIER }) role: Role;
  @ApiProperty({ type: Boolean, example: true, description: 'false = locked account.' })
  isActive: boolean;
  @ApiTimestamp() createdAt: string;
  @ApiTimestamp() updatedAt: string;
}
