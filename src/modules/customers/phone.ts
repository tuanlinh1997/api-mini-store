import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

const PHONE_SEPARATORS = /[\s.\-()]/g;
const INTERNATIONAL_PLUS_PREFIX = /^\+84(\d+)$/;
const INTERNATIONAL_PREFIX = /^84(\d{9,10})$/;
/** Normalised local format: leading 0 followed by 9-10 digits (10-11 digits in total). */
export const VIETNAM_PHONE_PATTERN = /^0\d{9,10}$/;

/**
 * Normalises a Vietnamese phone number to its local form so uniqueness and lookups are
 * consistent: separators are stripped and a +84 / 84 prefix becomes 0.
 * The result is not guaranteed valid; validate it against VIETNAM_PHONE_PATTERN.
 */
export function normalizeVietnamesePhone(input: string): string {
  const compact = input.trim().replace(PHONE_SEPARATORS, '');
  const plusMatch = INTERNATIONAL_PLUS_PREFIX.exec(compact);
  if (plusMatch) {
    return `0${plusMatch[1]}`;
  }
  const bareMatch = INTERNATIONAL_PREFIX.exec(compact);
  if (bareMatch) {
    return `0${bareMatch[1]}`;
  }
  return compact;
}

/** DTO decorator: normalise then require a 10-11 digit Vietnamese number. */
export function IsVietnamesePhone(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizeVietnamesePhone(value) : value,
    ),
    Matches(VIETNAM_PHONE_PATTERN, {
      message: 'Số điện thoại phải gồm 10-11 chữ số, bắt đầu bằng 0 hoặc +84',
    }),
  );
}
