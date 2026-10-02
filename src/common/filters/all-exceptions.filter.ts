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

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const STATUS_TO_MESSAGE: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Yêu cầu không hợp lệ.',
  [HttpStatus.UNAUTHORIZED]: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
  [HttpStatus.FORBIDDEN]: 'Bạn không có quyền thực hiện thao tác này.',
  [HttpStatus.NOT_FOUND]: 'Không tìm thấy tài nguyên yêu cầu.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
};

const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

/** Converts every thrown error into the common error envelope; never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const envelope = this.toEnvelope(exception, request.id);

    if (envelope.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.id}] ${request.method} ${request.url.split('?')[0]} -> ${envelope.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    void reply.status(envelope.statusCode).send(envelope);
  }

  private toEnvelope(exception: unknown, requestId: string): ErrorEnvelope {
    if (exception instanceof AppException) {
      return this.build(
        exception.getStatus(),
        exception.code,
        exception.message,
        requestId,
        exception.details,
      );
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception, requestId);
    }
    return this.build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      INTERNAL_ERROR_MESSAGE,
      requestId,
    );
  }

  private fromHttpException(exception: HttpException, requestId: string): ErrorEnvelope {
    const status = exception.getStatus();
    const code = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
    const message = STATUS_TO_MESSAGE[status] ?? 'Yêu cầu không thể xử lý.';
    const response = exception.getResponse();
    const details =
      status === HttpStatus.BAD_REQUEST && typeof response === 'object' && response !== null
        ? this.extractValidationDetails(response)
        : undefined;
    return this.build(status, code, message, requestId, details);
  }

  private extractValidationDetails(response: object): unknown {
    const messages = (response as { message?: unknown }).message;
    return Array.isArray(messages) ? messages : undefined;
  }

  private fromPrismaError(
    error: Prisma.PrismaClientKnownRequestError,
    requestId: string,
  ): ErrorEnvelope {
    switch (error.code) {
      case 'P2002':
        return this.build(
          HttpStatus.CONFLICT,
          ErrorCode.DUPLICATE_VALUE,
          'Giá trị đã tồn tại trong hệ thống.',
          requestId,
          { fields: error.meta?.target },
        );
      case 'P2003':
        return this.build(
          HttpStatus.CONFLICT,
          ErrorCode.RESOURCE_IN_USE,
          'Dữ liệu đang được tham chiếu hoặc tham chiếu không hợp lệ.',
          requestId,
        );
      case 'P2025':
        return this.build(
          HttpStatus.NOT_FOUND,
          ErrorCode.NOT_FOUND,
          STATUS_TO_MESSAGE[HttpStatus.NOT_FOUND] ?? '',
          requestId,
        );
      default:
        return this.build(
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR,
          INTERNAL_ERROR_MESSAGE,
          requestId,
        );
    }
  }

  private build(
    statusCode: number,
    code: ErrorCode,
    message: string,
    requestId: string,
    details?: unknown,
  ): ErrorEnvelope {
    const error = (HttpStatus[statusCode] ?? 'ERROR')
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
    return {
      statusCode,
      error,
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId,
    };
  }
}
