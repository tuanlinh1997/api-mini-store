import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ maxLength: 50, example: 'cashier', description: 'Case-insensitive.' })
  @IsString({ message: 'Tên đăng nhập là bắt buộc' })
  @IsNotEmpty({ message: 'Tên đăng nhập là bắt buộc' })
  @MaxLength(50)
  username: string;

  @ApiProperty({ maxLength: 128, format: 'password', example: 'your-password' })
  @IsString({ message: 'Mật khẩu là bắt buộc' })
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ maxLength: 256, description: 'The latest refresh token. Single use.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken: string;
}

export interface SessionUserView {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

export interface AuthTokensView {
  tokenType: 'Bearer';
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SessionUserView;
}
