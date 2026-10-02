import { Writable } from 'node:stream';

import pino from 'pino';

import { NodeEnvironment } from 'src/config/environment';

import { buildLoggerParams, REDACTED_PATHS, resolvePinoLevel } from './logging.config';

function captureLogger(): { logger: pino.Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  const logger = pino({ redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } }, sink);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('logging configuration', () => {
  it('redacts authorization headers, passwords and refresh tokens', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc', 'x-request-id': 'r1' } },
        password: 'hunter2',
        body: { refreshToken: 'tok', password: 'hunter2' },
      },
      'sample',
    );
    const output = JSON.stringify(lines());
    expect(output).not.toContain('Bearer abc');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('"tok"');
    expect(output).toContain('r1');
  });

  it('maps the project log levels to pino levels', () => {
    expect(resolvePinoLevel('log')).toBe('info');
    expect(resolvePinoLevel('debug')).toBe('debug');
    expect(resolvePinoLevel('silent')).toBe('silent');
    expect(resolvePinoLevel('nonsense')).toBe('info');
  });

  it('uses pino-pretty only in development', () => {
    const resolveId = (): string => 'id';
    const options = (env: NodeEnvironment): Record<string, unknown> =>
      buildLoggerParams('log', env, resolveId).pinoHttp as Record<string, unknown>;
    expect(options(NodeEnvironment.DEVELOPMENT).transport).toMatchObject({ target: 'pino-pretty' });
    expect(options(NodeEnvironment.PRODUCTION).transport).toBeUndefined();
  });
});
