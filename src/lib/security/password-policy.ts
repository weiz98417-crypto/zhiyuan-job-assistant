export type PasswordPolicyReason =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG_BYTES'
  | 'PASSWORD_TOO_COMMON'
  | 'PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER';

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; code: PasswordPolicyReason; message: string };

const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  'admin123',
  'password',
  'password123',
  'qwerty123',
]);

function normalizeForComparison(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validatePassword(
  password: string,
  identity: {
    username?: string;
    email?: string;
    role?: 'member' | 'admin' | 'superadmin';
  } = {},
): PasswordPolicyResult {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_COMMON',
      message: '该密码过于常见，请使用更难猜测的密码',
    };
  }

  if (new TextEncoder().encode(password).byteLength > 72) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_LONG_BYTES',
      message: '密码的 UTF-8 编码不能超过 72 字节',
    };
  }

  const minimumLength = identity.role === 'admin' || identity.role === 'superadmin' ? 16 : 12;
  if (password.length < minimumLength) {
    return {
      ok: false,
      code: 'PASSWORD_TOO_SHORT',
      message: `密码至少需要 ${minimumLength} 个字符`,
    };
  }

  const normalizedPassword = normalizeForComparison(password);
  const accountIdentifiers = [
    identity.username || '',
    (identity.email || '').split('@')[0] || '',
  ].map(normalizeForComparison).filter((value) => value.length >= 4);
  if (accountIdentifiers.some((identifier) => normalizedPassword.includes(identifier))) {
    return {
      ok: false,
      code: 'PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER',
      message: '密码不能包含用户名或其他账号信息',
    };
  }

  return { ok: true };
}
