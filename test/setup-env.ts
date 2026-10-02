import { randomBytes } from 'node:crypto';

import { resolveTestDatabaseUrl } from './test-env';

// Runs in every e2e worker before the app is created. Values here are test-only.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64url');
process.env.LOG_LEVEL = 'silent';
process.env.SWAGGER_ENABLED = 'false';
process.env.CORS_ORIGINS = '';
process.env.THROTTLE_LIMIT = '100000';
process.env.LOGIN_THROTTLE_LIMIT = '100000';
process.env.MAX_DISCOUNT_PERCENT_CASHIER = '10';
process.env.MAX_DISCOUNT_PERCENT_ADMIN = '100';
process.env.POINTS_PER_VND = '10000';
process.env.STORE_NAME = 'Test Store';
