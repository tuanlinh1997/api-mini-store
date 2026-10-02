import { FastifyInstance } from 'fastify';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

export const MALFORMED_JSON_MESSAGE = 'Nội dung JSON không hợp lệ.';
export const EMPTY_BODY_MESSAGE = 'Nội dung yêu cầu không được để trống.';

const INVALID_JSON_CODE = 'FST_ERR_CTP_INVALID_JSON_BODY';
const EMPTY_JSON_CODE = 'FST_ERR_CTP_EMPTY_JSON_BODY';

/**
 * Nest turns Fastify's body-parser errors into a generic HttpException and drops their FST_ code,
 * so they cannot be told apart afterwards. Mapping them at the source keeps the specific message.
 */
export function toBodyParseException(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === INVALID_JSON_CODE) {
    return AppException.badRequest(ErrorCode.VALIDATION_ERROR, MALFORMED_JSON_MESSAGE);
  }
  if (code === EMPTY_JSON_CODE) {
    return AppException.badRequest(ErrorCode.VALIDATION_ERROR, EMPTY_BODY_MESSAGE);
  }
  return error;
}

type JsonParserCallback = (error: Error | null, parsed?: unknown) => void;

/**
 * Builds the application/json parser: Fastify's own parser (prototype-poisoning protection
 * included) with its errors translated by {@link toBodyParseException}.
 */
export function createJsonBodyParser(
  fastify: FastifyInstance,
): (request: unknown, body: Buffer, done: JsonParserCallback) => void {
  const parseDefault = fastify.getDefaultJsonParser('error', 'error') as unknown as (
    request: unknown,
    body: string,
    done: JsonParserCallback,
  ) => void;
  return (request, body, done) => {
    parseDefault(request, body.toString('utf8'), (error, parsed) => {
      done(error ? (toBodyParseException(error) as Error) : null, parsed);
    });
  };
}
