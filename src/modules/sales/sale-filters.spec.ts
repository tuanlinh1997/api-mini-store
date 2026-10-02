import { customerMatching } from './sale-filters';

describe('customerMatching', () => {
  it('matches the customer code as typed', () => {
    expect(customerMatching('KH0001')).toEqual({
      OR: [{ customerCode: { contains: 'KH0001' } }, { phone: { contains: 'KH0001' } }],
    });
  });

  it('normalises international phone formats before matching the phone', () => {
    expect(customerMatching('+84 912 345 678')).toEqual({
      OR: [
        { customerCode: { contains: '+84 912 345 678' } },
        { phone: { contains: '0912345678' } },
      ],
    });
  });
});
