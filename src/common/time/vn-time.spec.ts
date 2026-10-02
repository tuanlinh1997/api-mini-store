import { AppException } from 'src/common/errors/app.exception';
import { ErrorCode } from 'src/common/errors/error-codes';

import { storeDateStamp, toOptionalUtcRange, toUtcRange } from './vn-time';

function errorCodeOf(action: () => unknown): ErrorCode | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppException ? error.code : undefined;
  }
  return undefined;
}

describe('toUtcRange', () => {
  it('maps inclusive Vietnam dates to a half-open UTC range', () => {
    const range = toUtcRange('2026-10-01', '2026-10-02');
    expect(range.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(range.endExclusive.toISOString()).toBe('2026-10-02T17:00:00.000Z');
  });

  it('accepts a single-day range', () => {
    const range = toUtcRange('2026-10-02', '2026-10-02');
    expect(range.endExclusive.getTime() - range.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('rejects to < from with INVALID_DATE_RANGE', () => {
    expect(errorCodeOf(() => toUtcRange('2026-10-02', '2026-10-01'))).toBe(
      ErrorCode.INVALID_DATE_RANGE,
    );
  });

  it('rejects impossible calendar dates', () => {
    expect(errorCodeOf(() => toUtcRange('2026-02-30', '2026-03-01'))).toBe(
      ErrorCode.INVALID_DATE_RANGE,
    );
  });

  it('enforces the maximum range length', () => {
    expect(errorCodeOf(() => toUtcRange('2026-01-01', '2026-12-31', 366))).toBeUndefined();
    expect(errorCodeOf(() => toUtcRange('2025-01-01', '2026-01-02', 366))).toBe(
      ErrorCode.INVALID_DATE_RANGE,
    );
  });
});

describe('toOptionalUtcRange', () => {
  it('returns undefined with no bounds and open-ended ranges for one bound', () => {
    expect(toOptionalUtcRange()).toBeUndefined();
    expect(toOptionalUtcRange('2026-10-01')?.lt).toBeUndefined();
    expect(toOptionalUtcRange(undefined, '2026-10-01')?.gte).toBeUndefined();
  });
});

describe('storeDateStamp', () => {
  it('uses the Vietnam calendar day, not the UTC day', () => {
    // 2026-10-01 20:00 UTC is already 2026-10-02 03:00 in Vietnam.
    expect(storeDateStamp(new Date('2026-10-01T20:00:00.000Z'))).toBe('20261002');
    expect(storeDateStamp(new Date('2026-10-01T10:00:00.000Z'))).toBe('20261001');
  });
});
