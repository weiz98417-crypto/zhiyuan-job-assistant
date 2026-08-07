export function planSoleAdminPromotion(activePrivilegedUsers, expectedUsername) {
  const normalizedExpected = String(expectedUsername || '').trim().toLowerCase();
  if (!normalizedExpected) throw new Error('--username is required');
  if (activePrivilegedUsers.length !== 1) {
    throw new Error('Promotion requires exactly one active privileged account');
  }

  const target = activePrivilegedUsers[0];
  if (String(target.username).trim().toLowerCase() !== normalizedExpected) {
    throw new Error('The sole active privileged account does not match --username');
  }
  if (target.role === 'superadmin') {
    return { action: 'noop', userId: target.id, username: target.username };
  }
  if (target.role !== 'admin') {
    throw new Error(`Unsupported privileged role: ${target.role}`);
  }
  return { action: 'promote', userId: target.id, username: target.username };
}
