import { DateTime } from 'luxon';

import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

/** The store operates in Vietnam time; storage is UTC. */
export const STORE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
/** Fixed offset used inside SQL (Vietnam has no DST), so MySQL time-zone tables are not needed. */
export const STORE_UTC_OFFSET_HOURS = 7;
export const MAX_REPORT_RANGE_DAYS = 366;

export interface UtcRange {
  /** Inclusive lower bound (UTC instant of 00:00 store time on `from`). */
  start: Date;
  /** Exclusive upper bound (UTC instant of 00:00 store time the day after `to`). */
  endExclusive: Date;
  from: string;
  to: string;
}

function parseStoreDate(value: string, label: string): DateTime {
  const parsed = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: STORE_TIME_ZONE });
  if (!parsed.isValid) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      `${label} không phải ngày hợp lệ (định dạng YYYY-MM-DD).`,
    );
  }
  return parsed;
}

/**
 * Converts inclusive store-time dates into a half-open UTC range.
 * Throws 400 INVALID_DATE_RANGE when to < from or the range exceeds maxDays.
 */
export function toUtcRange(from: string, to: string, maxDays?: number): UtcRange {
  const start = parseStoreDate(from, 'Ngày bắt đầu');
  const end = parseStoreDate(to, 'Ngày kết thúc');
  if (end < start) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.',
    );
  }
  const inclusiveDays = Math.round(end.diff(start, 'days').days) + 1;
  if (maxDays !== undefined && inclusiveDays > maxDays) {
    throw AppException.badRequest(
      ErrorCode.INVALID_DATE_RANGE,
      `Khoảng thời gian tối đa là ${maxDays} ngày.`,
    );
  }
  return {
    start: start.toUTC().toJSDate(),
    endExclusive: end.plus({ days: 1 }).toUTC().toJSDate(),
    from,
    to,
  };
}

/** Optional range: both bounds present -> validated range; one bound -> open-ended; none -> undefined. */
export function toOptionalUtcRange(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }
  if (from && to) {
    const range = toUtcRange(from, to);
    return { gte: range.start, lt: range.endExclusive };
  }
  if (from) {
    return { gte: parseStoreDate(from, 'Ngày bắt đầu').toUTC().toJSDate() };
  }
  const end = parseStoreDate(to ?? '', 'Ngày kết thúc');
  return { lt: end.plus({ days: 1 }).toUTC().toJSDate() };
}

/** yyyyMMdd of the given instant in store time (used in document numbers). */
export function storeDateStamp(instant: Date): string {
  return DateTime.fromJSDate(instant, { zone: STORE_TIME_ZONE }).toFormat('yyyyLLdd');
}
