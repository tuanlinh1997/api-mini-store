import { ExecutionContext, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ResponseEnvelopeInterceptor } from 'src/common/interceptors/response-envelope.interceptor';
import { SequencesModule } from 'src/common/sequences/sequences.module';
import { createValidationPipe } from 'src/common/validation/validation';
import { EnvironmentVariables, validateEnvironment } from 'src/config/environment';
import { HealthController } from 'src/health/health.controller';
import { AuthModule } from 'src/modules/auth/auth.module';
import {
  LOGIN_THROTTLE_KEY,
  LOGIN_THROTTLER_NAME,
} from 'src/modules/auth/login-throttle.decorator';
import { CategoriesModule } from 'src/modules/categories/categories.module';
import { CustomersModule } from 'src/modules/customers/customers.module';
import { InventoryModule } from 'src/modules/inventory/inventory.module';
import { ProductsModule } from 'src/modules/products/products.module';
import { PurchasesModule } from 'src/modules/purchases/purchases.module';
import { ReportsModule } from 'src/modules/reports/reports.module';
import { SalesModule } from 'src/modules/sales/sales.module';
import { SuppliersModule } from 'src/modules/suppliers/suppliers.module';
import { UsersModule } from 'src/modules/users/users.module';
import { PrismaModule } from 'src/prisma/prisma.module';

const MILLISECONDS_PER_SECOND = 1000;

function isNotLoginRoute(context: ExecutionContext): boolean {
  return !Reflect.getMetadata(LOGIN_THROTTLE_KEY, context.getHandler());
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment, cache: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_TTL_SECONDS', { infer: true }) * MILLISECONDS_PER_SECOND,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
          {
            name: LOGIN_THROTTLER_NAME,
            ttl:
              config.get('LOGIN_THROTTLE_TTL_SECONDS', { infer: true }) * MILLISECONDS_PER_SECOND,
            limit: config.get('LOGIN_THROTTLE_LIMIT', { infer: true }),
            skipIf: isNotLoginRoute,
          },
        ],
      }),
    }),
    PrismaModule,
    SequencesModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    PurchasesModule,
    SalesModule,
    InventoryModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit -> authenticate -> authorise (deny by default).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
