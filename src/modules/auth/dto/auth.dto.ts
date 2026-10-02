import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Tên đăng nhập là bắt buộc' })
  @IsNotEmpty({ message: 'Tên đăng nhập là bắt buộc' })
  @MaxLength(50)
  username: string;

  @IsString({ message: 'Mật khẩu là bắt buộc' })
  @IsNotEmpty({ message: 'Mật khẩu là bắt buộc' })
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
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
