import 'dotenv/config';
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from 'src/app.module';
import { configureApplication, generateRequestId, SWAGGER_PATH } from 'src/app.setup';
import { validateEnvironment } from 'src/config/environment';

async function bootstrap(): Promise<void> {
  const env = validateEnvironment(process.env);
  const adapter = new FastifyAdapter({
    trustProxy: env.TRUST_PROXY,
    genReqId: generateRequestId,
    bodyLimit: 1024 * 1024,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  await configureApplication(app);
  await app.listen(env.PORT, env.HOST);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on ${await app.getUrl()}/api/v1`);
  if (env.SWAGGER_ENABLED) {
    logger.log(`Swagger UI at /${SWAGGER_PATH}`);
  }
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error({ err: error }, 'Application failed to start');
  process.exit(1);
});
