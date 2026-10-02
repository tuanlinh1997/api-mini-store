import { ValidationError } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

import { createValidationPipe } from './validation';
import { translateConstraint } from './validation-messages';

describe('translateConstraint', () => {
  it.each([
    ['username', 'isString', 'username must be a string', 'Tên đăng nhập phải là chuỗi ký tự'],
    ['quantity', 'isInt', 'quantity must be an integer number', 'Số lượng phải là số nguyên'],
    ['quantity', 'min', 'quantity must not be less than 1', 'Số lượng phải lớn hơn hoặc bằng 1'],
    [
      'pageSize',
      'max',
      'pageSize must not be greater than 100',
      'Số dòng mỗi trang phải nhỏ hơn hoặc bằng 100',
    ],
    [
      'password',
      'minLength',
      'password must be longer than or equal to 8 characters',
      'Mật khẩu phải có ít nhất 8 ký tự',
    ],
    [
      'name',
      'maxLength',
      'name must be shorter than or equal to 120 characters',
      'Tên không được vượt quá 120 ký tự',
    ],
    [
      'items',
      'arrayMinSize',
      'items must contain at least 1 elements',
      'Danh sách hàng phải có ít nhất 1 phần tử',
    ],
    [
      'salePrice',
      'isNumber',
      'salePrice must be a number conforming to the specified constraints',
      'Giá bán phải là số hợp lệ',
    ],
    ['role', 'isEnum', 'role must be one of the following values: ADMIN', 'Vai trò không hợp lệ'],
    ['email', 'isEmail', 'email must be an email', 'Email không đúng định dạng'],
    [
      'stockQty',
      'whitelistValidation',
      'property stockQty should not exist',
      'Trường "stockQty" không được phép gửi lên',
    ],
    [
      'someField',
      'isBoolean',
      'someField must be a boolean value',
      'someField phải là true hoặc false',
    ],
  ])('%s / %s -> Vietnamese', (property, constraint, english, expected) => {
    expect(translateConstraint(property, constraint, english)).toBe(expected);
  });

  it('keeps messages that are already Vietnamese', () => {
    expect(translateConstraint('quantity', 'min', 'Số lượng phải lớn hơn 0')).toBe(
      'Số lượng phải lớn hơn 0',
    );
  });

  it('falls back to a generic Vietnamese message for unknown constraints', () => {
    expect(translateConstraint('name', 'customThing', 'bad')).toBe('Tên không hợp lệ');
  });
});

describe('validation pipe exception factory', () => {
  it('returns [{ field, messages }] with Vietnamese texts, including nested paths', () => {
    const errors: ValidationError[] = [
      {
        property: 'items',
        constraints: undefined,
        children: [
          {
            property: '0',
            children: [
              {
                property: 'quantity',
                constraints: {
                  min: 'quantity must not be less than 1',
                  isInt: 'quantity must be an integer number',
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    const factory = (
      createValidationPipe() as unknown as {
        exceptionFactory: (errors: ValidationError[]) => BadRequestException;
      }
    ).exceptionFactory;
    const response = factory(errors).getResponse() as { message: unknown };
    expect(response.message).toEqual([
      {
        field: 'items.0.quantity',
        messages: ['Số lượng phải lớn hơn hoặc bằng 1', 'Số lượng phải là số nguyên'],
      },
    ]);
  });
});
