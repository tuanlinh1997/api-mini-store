import { formatDocumentNumber } from './document-numbers.service';

describe('formatDocumentNumber', () => {
  it('builds invoice numbers as prefix + yyyyMMdd + 4-digit sequence', () => {
    expect(formatDocumentNumber('HD', '20261002', 1, 4)).toBe('HD202610020001');
    expect(formatDocumentNumber('HD', '20261002', 123, 4)).toBe('HD202610020123');
  });

  it('builds customer codes with a 6-digit global sequence', () => {
    expect(formatDocumentNumber('KH', '', 42, 6)).toBe('KH000042');
  });

  it('keeps growing instead of truncating past the padding width', () => {
    expect(formatDocumentNumber('HD', '20261002', 12345, 4)).toBe('HD2026100212345');
  });
});
