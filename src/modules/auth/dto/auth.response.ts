import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ApiId, ApiTimestamp } from 'src/common/swagger/api-properties';

export class SessionUserResponse {
  @ApiId({ example: 2 }) id: number;
  @ApiProperty({ example: 'cashier', description: 'Lower-case login name.' }) username: string;
  @ApiProperty({ example: 'Nguyễn Văn An' }) fullName: string;
  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.CASHIER }) role: Role;
}

export class AuthTokensResponse {
  @ApiProperty({ type: String, enum: ['Bearer'], example: 'Bearer' }) tokenType: 'Bearer';

  @ApiProperty({ description: 'JWT. Send as `Authorization: Bearer <accessToken>`.' })
  accessToken: string;

  @ApiProperty({ type: 'integer', example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn: number;

  @ApiProperty({ description: 'Opaque, single-use: every refresh returns a new one.' })
  refreshToken: string;

  @ApiTimestamp({ description: 'When the refresh token (session) expires.' })
  refreshExpiresAt: string;

  @ApiProperty({ type: SessionUserResponse }) user: SessionUserResponse;
}
