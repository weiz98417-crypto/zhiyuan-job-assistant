const SECRET_FIELDS = ['JWT_SECRET', 'CSRF_SECRET', 'AUTH_RATE_LIMIT_SECRET'];

function validUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function looksLikePlaceholder(value) {
  return /(change|replace|example|placeholder|your[_-]|secret_here)/i.test(value);
}

export function validateAuthSecurityConfig(environment) {
  const errors = [];
  const checks = [];
  const read = (name) => String(environment[name] || '').trim();

  if (read('NODE_ENV') !== 'production') errors.push('NODE_ENV must be production');
  else checks.push('production runtime');

  if (read('DB_DRIVER').toLowerCase() !== 'postgres') errors.push('DB_DRIVER must be postgres');
  else checks.push('postgres runtime driver');

  const databaseUrl = validUrl(read('DATABASE_URL'), ['postgres:', 'postgresql:']);
  if (!databaseUrl) errors.push('DATABASE_URL must be a valid PostgreSQL URL');
  else checks.push('postgres connection configuration');

  const appOrigin = validUrl(read('APP_ORIGIN'), ['https:']);
  if (!appOrigin) errors.push('APP_ORIGIN must use https');
  else checks.push('https application origin');

  if (read('AUTH_COOKIE_SECURE').toLowerCase() !== 'true') {
    errors.push('AUTH_COOKIE_SECURE must be true');
  } else checks.push('secure authentication cookies');

  if (!['127.0.0.1', '::1', 'localhost'].includes(read('APP_BIND_HOST').toLowerCase())) {
    errors.push('APP_BIND_HOST must be loopback');
  } else checks.push('loopback application binding');

  const secrets = [];
  for (const name of SECRET_FIELDS) {
    const value = read(name);
    secrets.push(value);
    if (value.length < 32 || looksLikePlaceholder(value)) {
      errors.push(`${name} must be an explicit non-placeholder secret of at least 32 characters`);
    }
  }
  if (new Set(secrets.filter(Boolean)).size !== secrets.filter(Boolean).length) {
    errors.push('JWT_SECRET, CSRF_SECRET, and AUTH_RATE_LIMIT_SECRET must be independent');
  }
  if (!errors.some((error) => SECRET_FIELDS.some((name) => error.startsWith(name)))) {
    checks.push('independent authentication secrets');
  }

  const redisUrl = validUrl(read('REDIS_URL'), ['redis:', 'rediss:']);
  if (!redisUrl || !redisUrl.password) {
    errors.push('REDIS_URL must be a password-authenticated Redis URL');
  } else checks.push('dedicated redis configuration');

  const alertUrl = validUrl(read('SECURITY_ALERT_WEBHOOK_URL'), ['https:']);
  if (!alertUrl) errors.push('SECURITY_ALERT_WEBHOOK_URL must use https');
  else checks.push('security alert webhook');

  if (errors.length) {
    throw new Error(`Authentication security preflight configuration failed:\n${errors.join('\n')}`);
  }
  return checks;
}
