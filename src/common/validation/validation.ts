import {
  applyDecorators,
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, Matches, Max, Min } from 'class-validator';

import { translateConstraint } from './validation-messages';

export interface FieldIssue {
  field: string;
  messages: string[];
}

function flattenErrors(errors: ValidationError[], parentPath = ''): FieldIssue[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: FieldIssue[] = error.constraints
      ? [
          {
            field: path,
            messages: Object.entries(error.constraints).map(([constraint, message]) =>
              translateConstraint(error.property, constraint, message),
            ),
          },
        ]
      : [];
    return [...own, ...flattenErrors(error.children ?? [], path)];
  });
}

/** Global pipe: strip unknown props, reject unexpected ones, transform query/body types. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]): BadRequestException =>
      new BadRequestException({ message: flattenErrors(errors) }),
  });
}

/** Query-string booleans: "true"/"1" -> true, "false"/"0" -> false. */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const rawValue = obj[key];
    if (rawValue === 'true' || rawValue === '1' || rawValue === true) {
      return true;
    }
    if (rawValue === 'false' || rawValue === '0' || rawValue === false) {
      return false;
    }
    return rawValue;
  });
}

/** Trims strings (and turns blank strings into undefined so optional fields stay optional). */
export function TrimToUndefined(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });
}

/** Trims strings but keeps blank strings (so @IsNotEmpty can reject them). */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD calendar date (interpreted in Asia/Ho_Chi_Minh by the services). */
export function IsIsoDate(): PropertyDecorator {
  return Matches(ISO_DATE_PATTERN, { message: '$property phải có định dạng YYYY-MM-DD' });
}

/** Escapes LIKE wildcards so user text is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export const MAX_MONEY_AMOUNT = 9_999_999_999;
const MONEY_DECIMAL_PLACES = 2;

/** VND amount: a finite number with at most 2 decimals, between min and MAX_MONEY_AMOUNT. */
export function IsMoneyAmount(min = 0): PropertyDecorator {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: MONEY_DECIMAL_PLACES }),
    Min(min),
    Max(MAX_MONEY_AMOUNT),
  );
}

/** Product code (SKU / barcode): 1-50 chars of letters, digits and . _ - / */
export const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9._\-/]{1,50}$/;
