import { normalizeVietnamesePhone, VIETNAM_PHONE_PATTERN } from './phone';

describe('normalizeVietnamesePhone', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['+84901234567', '0901234567'],
    ['84901234567', '0901234567'],
    ['0901 234 567', '0901234567'],
    ['(090) 123-4567', '0901234567'],
    ['02812345678', '02812345678'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeVietnamesePhone(input)).toBe(expected);
  });

  it('produces values that match the accepted pattern for valid input', () => {
    expect(VIETNAM_PHONE_PATTERN.test(normalizeVietnamesePhone('+84 90 123 4567'))).toBe(true);
  });

  it.each(['12345', 'abcdefghij', '090123456', '090123456789'])('rejects %s', (input) => {
    expect(VIETNAM_PHONE_PATTERN.test(normalizeVietnamesePhone(input))).toBe(false);
  });
});
