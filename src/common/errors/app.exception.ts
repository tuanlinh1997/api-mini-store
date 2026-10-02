import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from './error-codes';

/** A business-rule or API error with a stable machine-readable code and a Vietnamese message. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(code: ErrorCode, message: string): AppException {
    return new AppException(HttpStatus.FORBIDDEN, code, message);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(HttpStatus.CONFLICT, code, message, details);
  }

  /** The request is well-formed but violates a business rule. */
  static unprocessable(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
  }
}
