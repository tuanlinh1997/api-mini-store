import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

import { createJsonBodyParser } from 'src/common/validation/json-body-parser';
import { rememberRoute } from 'src/common/logging/logging.config';
import { EnvironmentVariables } from 'src/config/environment';

export const GLOBAL_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const requestIds = new WeakMap<object, string>();

/**
 * Reuses a sane inbound X-Request-Id, otherwise generates one. The result is memoised per
 * request (keyed by its headers object) so Fastify and pino-http agree on a single id.
 */
export function generateRequestId(request: { headers: FastifyRequest['headers'] }): string {
  const known = requestIds.get(request.headers);
  if (known) {
    return known;
  }
  const inbound = request.headers['x-request-id'];
  const requestId =
    typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
  requestIds.set(request.headers, requestId);
  return requestId;
}

/**
 * Applies everything that is not module wiring: prefix, security headers, CORS, Swagger and
 * the logger. Shared by main.ts and the e2e tests so both run the same pipeline.
 */
export async function configureApplication(app: NestFastifyApplication): Promise<void> {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableShutdownHooks();

  const isSwaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });
  await registerSecurityHeaders(app, isSwaggerEnabled);
  enableCors(app, config.get('CORS_ORIGINS', { infer: true }));
  if (isSwaggerEnabled) {
    setupSwagger(app);
  }
  registerRouteContext(app);
  app.useBodyParser(
    'application/json',
    {},
    createJsonBodyParser(app.getHttpAdapter().getInstance()),
  );
}

/** Makes the matched route pattern (e.g. /api/v1/sales/:id) available to request logs. */
function registerRouteContext(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, _reply, done) => {
      rememberRoute(request.raw, request.routeOptions.url);
      done();
    });
}

async function registerSecurityHeaders(
  app: NestFastifyApplication,
  isSwaggerEnabled: boolean,
): Promise<void> {
  // Swagger UI needs inline scripts/styles; the CSP is only relaxed when the docs are enabled.
  await app.register(
    helmet,
    isSwaggerEnabled
      ? {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
            },
          },
        }
      : {},
  );
}

function enableCors(app: NestFastifyApplication, rawOrigins: string): void {
  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (allowedOrigins.length === 0) {
    return;
  }
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });
}

function setupSwagger(app: NestFastifyApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Mini Store API')
      .setDescription('Quản lý siêu thị mini - REST API. Xác thực bằng Bearer JWT.')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
