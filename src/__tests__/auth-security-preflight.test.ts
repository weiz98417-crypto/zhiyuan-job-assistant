import { describe, expect, it } from 'vitest';
import { validateAuthSecurityConfig } from '../../scripts/lib/auth-security-preflight.mjs';

const validEnvironment = {
  NODE_ENV: 'production',
  DB_DRIVER: 'postgres',
  DATABASE_URL: 'postgresql://app:secret@127.0.0.1:5432/zhiyuan',
  APP_ORIGIN: 'https://jobs.example.com',
  APP_BIND_HOST: '127.0.0.1',
  AUTH_COOKIE_SECURE: 'true',
  JWT_SECRET: 'jwt-secret-with-at-least-thirty-two-characters',
  CSRF_SECRET: 'csrf-secret-with-at-least-thirty-two-characters',
  AUTH_RATE_LIMIT_SECRET: 'rate-limit-secret-with-at-least-thirty-two-characters',
  REDIS_URL: 'redis://:password@127.0.0.1:6379/0',
  SECURITY_ALERT_WEBHOOK_URL: 'https://alerts.example.com/security',
};

describe('authentication security deployment preflight', () => {
  it('accepts a production HTTPS, Postgres, Redis, and explicit-secret configuration', () => {
    expect(validateAuthSecurityConfig(validEnvironment)).toEqual(expect.arrayContaining([
      'production runtime',
      'https application origin',
      'secure authentication cookies',
      'postgres runtime driver',
      'loopback application binding',
      'dedicated redis configuration',
      'security alert webhook',
    ]));
  });

  it('rejects HTTP origin and insecure cookies', () => {
    expect(() => validateAuthSecurityConfig({
      ...validEnvironment,
      APP_ORIGIN: 'http://jobs.example.com',
      AUTH_COOKIE_SECURE: 'false',
    })).toThrow(/APP_ORIGIN must use https[\s\S]*AUTH_COOKIE_SECURE must be true/);
  });

  it('rejects SQLite and missing independent security secrets', () => {
    expect(() => validateAuthSecurityConfig({
      ...validEnvironment,
      DB_DRIVER: 'sqlite',
      CSRF_SECRET: '',
      AUTH_RATE_LIMIT_SECRET: '',
    })).toThrow(/DB_DRIVER must be postgres[\s\S]*CSRF_SECRET[\s\S]*AUTH_RATE_LIMIT_SECRET/);
  });
});
