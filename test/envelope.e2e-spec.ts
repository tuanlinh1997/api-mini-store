import { buildOpenApiDocument } from 'src/common/swagger/openapi-document';

import { bearer, bootTestContext, createProduct, TestContext } from './helpers/test-app';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('Response envelope (e2e)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await bootTestContext();
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('wraps a success response (health) with the standard fields', async () => {
    const response = await context.http().get('/api/v1/health').expect(200);
    expect(response.body).toEqual({
      success: true,
      statusCode: 200,
      code: 'OK',
      message: 'Thành công',
      data: { status: 'ok', database: 'up' },
      requestId: expect.any(String),
      timestamp: expect.stringMatching(ISO_UTC),
    });
  });

  it('keeps real status codes and custom messages (201 on create)', async () => {
    const response = await context
      .http()
      .post('/api/v1/categories')
      .set('Authorization', await bearer(context, 'admin'))
      .send({ name: 'Envelope category' })
      .expect(201);
    expect(response.body).toMatchObject({
      success: true,
      statusCode: 201,
      code: 'OK',
      message: 'Tạo danh mục thành công',
      data: { name: 'Envelope category' },
    });
  });

  it('wraps lists as data = items with pagination in top-level meta', async () => {
    await createProduct(context.prisma);
    const response = await context
      .http()
      .get('/api/v1/products?pageSize=5')
      .set('Authorization', await bearer(context, 'admin'))
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 5, total: 1 });
    expect(response.body).not.toHaveProperty('items');
  });

  it('uses the same envelope for errors, with data null and no legacy error field', async () => {
    const response = await context
      .http()
      .get('/api/v1/products/999999')
      .set('Authorization', await bearer(context, 'admin'))
      .expect(404);
    expect(response.body).toEqual({
      success: false,
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
      message: 'Không tìm thấy sản phẩm.',
      data: null,
      requestId: expect.any(String),
      timestamp: expect.stringMatching(ISO_UTC),
    });
  });

  it('echoes a valid X-Request-Id in the envelope', async () => {
    const response = await context
      .http()
      .get('/api/v1/health')
      .set('X-Request-Id', 'trace-abc-123')
      .expect(200);
    expect(response.body.requestId).toBe('trace-abc-123');
  });

  it('returns 401 / 403 in the envelope', async () => {
    const unauthenticated = await context.http().get('/api/v1/users').expect(401);
    expect(unauthenticated.body).toMatchObject({ success: false, code: 'UNAUTHENTICATED' });
    const forbidden = await context
      .http()
      .get('/api/v1/users')
      .set('Authorization', await bearer(context, 'cashier'))
      .expect(403);
    expect(forbidden.body).toMatchObject({ success: false, code: 'FORBIDDEN', data: null });
  });

  it('documents the envelope with a typed data schema in the OpenAPI document', () => {
    const document = buildOpenApiDocument(context.app);
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(['ErrorEnvelopeDto', 'PageMetaDto', 'SaleDetailResponse']),
    );
    const checkout = JSON.stringify(document.paths['/api/v1/sales']?.post?.responses['201']);
    expect(checkout).toContain('"$ref":"#/components/schemas/SaleDetailResponse"');
    const list = JSON.stringify(document.paths['/api/v1/products']?.get?.responses['200']);
    expect(list).toContain('"$ref":"#/components/schemas/PageMetaDto"');
    expect(list).toContain('"$ref":"#/components/schemas/ProductResponse"');
  });

  describe('framework-level errors', () => {
    it('answers an unknown route with a 404 envelope', async () => {
      const response = await context.http().get('/api/v1/does-not-exist').expect(404);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
        code: 'NOT_FOUND',
        data: null,
        requestId: expect.any(String),
      });
    });

    it('answers malformed JSON with a 400 envelope', async () => {
      const response = await context
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "cashier", "password": ');
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Nội dung JSON không hợp lệ.',
        data: null,
      });
      expect(response.body).not.toHaveProperty('details');
    });

    it('answers an empty JSON body with a 400 envelope', async () => {
      const response = await context
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('');
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Nội dung yêu cầu không được để trống.',
      });
    });

    it('still blocks prototype-poisoning payloads', async () => {
      const response = await context
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"__proto__": {"role": "ADMIN"}}');
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('answers an unsupported content type with a 415 envelope', async () => {
      const response = await context
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'text/xml')
        .send('<a/>');
      expect(response.status).toBe(415);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    });
  });

  describe('validation messages', () => {
    it('are Vietnamese with field-level details', async () => {
      const response = await context
        .http()
        .post('/api/v1/users')
        .set('Authorization', await bearer(context, 'admin'))
        .send({ username: 'ok-user', password: 'short', fullName: 123, role: 'KING', extra: 1 })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      const details = response.body.details as { field: string; messages: string[] }[];
      const byField = Object.fromEntries(details.map((issue) => [issue.field, issue.messages]));
      expect(byField.password).toEqual(['Mật khẩu tối thiểu 8 ký tự']);
      expect(byField.role).toEqual(['Vai trò không hợp lệ']);
      expect(byField.extra).toEqual(['Trường "extra" không được phép gửi lên']);
      const everyMessage = details.flatMap((issue) => issue.messages);
      expect(everyMessage.every((message) => /[^ -~]/.test(message))).toBe(true);
    });

    it('translates quantity and money rules', async () => {
      const response = await context
        .http()
        .post('/api/v1/sales')
        .set('Authorization', await bearer(context, 'cashier'))
        .send({
          items: [{ productId: 1, quantity: 0 }],
          payments: [{ method: 'CASH', amount: 1.234 }],
        })
        .expect(400);
      const text = JSON.stringify(response.body.details);
      expect(text).toContain('Số lượng phải lớn hơn 0');
      expect(text).toContain('Số tiền phải là số hợp lệ');
    });
  });
});
