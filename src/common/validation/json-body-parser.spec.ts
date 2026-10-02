import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import {
  EMPTY_BODY_MESSAGE,
  MALFORMED_JSON_MESSAGE,
  toBodyParseException,
} from './json-body-parser';

function fastifyError(code: string): Error {
  return Object.assign(new Error('fastify says'), { statusCode: 400, code });
}

describe('toBodyParseException', () => {
  it('turns an invalid JSON error into a VALIDATION_ERROR with the Vietnamese message', () => {
    const result = toBodyParseException(fastifyError('FST_ERR_CTP_INVALID_JSON_BODY'));
    expect(result).toBeInstanceOf(AppException);
    expect(result).toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: MALFORMED_JSON_MESSAGE,
    });
    expect((result as AppException).getStatus()).toBe(400);
  });

  it('turns an empty body error into a VALIDATION_ERROR', () => {
    expect(toBodyParseException(fastifyError('FST_ERR_CTP_EMPTY_JSON_BODY'))).toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      message: EMPTY_BODY_MESSAGE,
    });
  });

  it('leaves other errors untouched', () => {
    const other = fastifyError('FST_ERR_CTP_BODY_TOO_LARGE');
    expect(toBodyParseException(other)).toBe(other);
  });
});
