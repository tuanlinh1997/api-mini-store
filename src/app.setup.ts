import { randomUUID } from 'node:crypto';

import { LogLevel, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { FastifyRequest } from 'fastify';

import { EnvironmentVariables } from 'src/config/environment';

export const GLOBAL_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const LOG_LEVELS: Record<string, LogLevel[]> = {
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  log: ['fatal', 'error', 'warn', 'log'],
  warn: ['fatal', 'error', 'warn'],
  error: ['fatal', 'error'],
  silent: [],
};

/** Reuses a sane inbound X-Request-Id, otherwise generates one. */
export function generateRequestId(request: { headers: FastifyRequest['headers'] }): string {
  const inbound = request.headers['x-request-id'];
  return typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
}

export function resolveLogLevels(level: string): LogLevel[] {
  return LOG_LEVELS[level] ?? LOG_LEVELS.log ?? [];
}

/**
 * Applies everything that is not module wiring: prefix, security headers, CORS, Swagger and
 * request logging. Shared by main.ts and the e2e tests so both run the same pipeline.
 */
export async function configureApplication(app: NestFastifyApplication): Promise<void> {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  app.useLogger(resolveLogLevels(config.get('LOG_LEVEL', { infer: true })));
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableShutdownHooks();

  const isSwaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });
  await registerSecurityHeaders(app, isSwaggerEnabled);
  enableCors(app, config.get('CORS_ORIGINS', { infer: true }));
  if (isSwaggerEnabled) {
    setupSwagger(app);
  }
  registerRequestLogging(app);
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

function registerRequestLogging(app: NestFastifyApplication): void {
  const logger = new Logger('HTTP');
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', (request, reply, done) => {
      const path = request.url.split('?')[0];
      logger.log(
        `${request.id} ${request.method} ${path} ${reply.statusCode} ` +
          `${Math.round(reply.elapsedTime)}ms user=${request.user?.id ?? '-'}`,
      );
      done();
    });
}
