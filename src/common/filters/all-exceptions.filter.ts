import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';
import {
  isCheckConstraintViolation,
  isDatabaseUnavailable,
  isTransactionTimeout,
  isTransientTransactionConflict,
} from 'src/prisma/database-errors';

export interface ErrorEnvelope {
  success: false;
  statusCode: number;
  code: ErrorCode;
  message: string;
  data: null;
  details?: unknown;
  requestId: string;
  timestamp: string;
}

interface ErrorParts {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const STATUS_TO_MESSAGE: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Yêu cầu không hợp lệ.',
  [HttpStatus.UNAUTHORIZED]: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  [HttpStatus.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
  [HttpStatus.NOT_FOUND]: 'Không tìm thấy tài nguyên yêu cầu.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]:
    'Định dạng nội dung không được hỗ trợ (cần application/json).',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Dữ liệu gửi lên quá lớn.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
};

const FASTIFY_BODY_ERRORS: Record<string, ErrorParts> = {
  FST_ERR_CTP_INVALID_JSON_BODY: {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Nội dung JSON không hợp lệ.',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Nội dung yêu cầu không được để trống.',
  },
};

const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';
const INTERNAL_PARTS: ErrorParts = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: ErrorCode.INTERNAL_ERROR,
  message: INTERNAL_ERROR_MESSAGE,
};

/** Errors raised by Fastify itself (body parsing, size limits), identified by their FST_ code. */
function fastifyClientError(exception: unknown): { statusCode: number; code: string } | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const { statusCode, code } = exception as { statusCode?: unknown; code?: unknown };
  const isClientError = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
  return isClientError && typeof code === 'string' && code.startsWith('FST_')
    ? { statusCode, code }
    : undefined;
}

/** Converts every thrown error into the standard error envelope; never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const envelope = this.toEnvelope(exception, request.id);

    // Only server faults are logged as errors; client errors (4xx) are expected traffic.
    if (envelope.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.id}] ${request.method} ${request.url.split('?')[0]} -> ${envelope.statusCode} ${envelope.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    void reply.status(envelope.statusCode).send(envelope);
  }

  /** Pure mapping, exposed for unit tests. */
  toEnvelope(exception: unknown, requestId: string): ErrorEnvelope {
    const parts = this.classify(exception);
    return {
      success: false,
      statusCode: parts.statusCode,
      code: parts.code,
      message: parts.message,
      data: null,
      ...(parts.details === undefined ? {} : { details: parts.details }),
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  private classify(exception: unknown): ErrorParts {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    const databaseParts = this.fromDatabaseError(exception);
    if (databaseParts) {
      return databaseParts;
    }
    const fastifyError = fastifyClientError(exception);
    if (fastifyError) {
      return FASTIFY_BODY_ERRORS[fastifyError.code] ?? this.fromStatus(fastifyError.statusCode);
    }
    return INTERNAL_PARTS;
  }

  private fromHttpException(exception: HttpException): ErrorParts {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const details =
      status === HttpStatus.BAD_REQUEST && typeof response === 'object' && response !== null
        ? this.extractValidationDetails(response)
        : undefined;
    return { ...this.fromStatus(status), details };
  }

  private fromStatus(status: number): ErrorParts {
    return {
      statusCode: status,
      code: STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR,
      message: STATUS_TO_MESSAGE[status] ?? 'Yêu cầu không thể xử lý.',
    };
  }

  private extractValidationDetails(response: object): unknown {
    const messages = (response as { message?: unknown }).message;
    return Array.isArray(messages) ? messages : undefined;
  }

  /** Maps Prisma / MySQL failures; returns undefined for errors that are not database related. */
  private fromDatabaseError(error: unknown): ErrorParts | undefined {
    if (isTransientTransactionConflict(error)) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.TRANSACTION_CONFLICT,
        message: 'Hệ thống đang bận do có giao dịch đồng thời, vui lòng thử lại.',
      };
    }
    if (isTransactionTimeout(error)) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.TRANSACTION_TIMEOUT,
        message: 'Giao dịch xử lý quá lâu và đã bị hủy, vui lòng thử lại.',
      };
    }
    if (isDatabaseUnavailable(error)) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Không kết nối được cơ sở dữ liệu, vui lòng thử lại.',
      };
    }
    if (isCheckConstraintViolation(error)) {
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.CONSTRAINT_VIOLATION,
        message: 'Dữ liệu vi phạm ràng buộc của hệ thống (ví dụ giá trị âm hoặc tồn kho âm).',
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromKnownRequestError(error);
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Yêu cầu không hợp lệ.',
      };
    }
    return undefined;
  }

  private fromKnownRequestError(error: Prisma.PrismaClientKnownRequestError): ErrorParts {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.DUPLICATE_VALUE,
          message: 'Giá trị đã tồn tại trong hệ thống.',
          details: { fields: error.meta?.target },
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.RESOURCE_IN_USE,
          message: 'Dữ liệu đang được tham chiếu hoặc tham chiếu không hợp lệ.',
        };
      case 'P2025':
        return this.fromStatus(HttpStatus.NOT_FOUND);
      default:
        return INTERNAL_PARTS;
    }
  }
}
