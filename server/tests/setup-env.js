// Must be imported before any application module so config/env.js sees these values.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-0123456789';
process.env.BCRYPT_ROUNDS = '4';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
