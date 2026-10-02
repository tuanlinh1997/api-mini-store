import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

// Read the raw value: implicit conversion would turn the string "false" into true.
const parseBoolean = ({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => {
  const rawValue = obj[key];
  return typeof rawValue === 'string' ? rawValue.toLowerCase() === 'true' : rawValue;
};

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.DEVELOPMENT;

  @IsString()
  HOST: string = '0.0.0.0';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  LOG_LEVEL: string = 'log';

  @Transform(parseBoolean)
  @IsBoolean()
  TRUST_PROXY: boolean = false;

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '';

  @Transform(parseBoolean)
  @IsBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS: number = 60;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 300;

  @IsInt()
  @Min(1)
  LOGIN_THROTTLE_TTL_SECONDS: number = 60;

  @IsInt()
  @Min(1)
  LOGIN_THROTTLE_LIMIT: number = 5;

  @IsNumber()
  @Min(0)
  @Max(100)
  MAX_DISCOUNT_PERCENT_CASHIER: number = 10;

  @IsNumber()
  @Min(0)
  @Max(100)
  MAX_DISCOUNT_PERCENT_ADMIN: number = 100;

  @IsInt()
  @Min(1)
  POINTS_PER_VND: number = 10000;

  @IsString()
  STORE_NAME: string = 'Siêu thị mini';

  @IsString()
  @IsOptional()
  STORE_ADDRESS: string = '';

  @IsString()
  @IsOptional()
  STORE_PHONE: string = '';
}

/** Validates and coerces raw process env into typed values; throws a readable error on failure. */
export function validateEnvironment(raw: Record<string, unknown>): EnvironmentVariables {
  const definedOnly = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = plainToInstance(EnvironmentVariables, definedOnly, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Invalid environment configuration: ${messages.join('; ')}`);
  }
  return parsed;
}
