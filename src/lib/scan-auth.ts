import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories, type UserRecord } from "@/lib/data-repositories";

export class ScanAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ScanAuthError";
  }
}

function activeUserMatchesToken(user: UserRecord | undefined, tokenVersion: number): user is UserRecord {
  return Boolean(
    user &&
    user.status === "active" &&
    Number(user.token_version) === Number(tokenVersion),
  );
}

export async function getCurrentScanUserId(): Promise<string> {
  let payload;
  try {
    payload = await getCurrentUser();
  } catch {
    throw new ScanAuthError();
  }

  const repos = getDataRepositories();
  const byId = await repos.users.findById(String(payload.userId));
  if (activeUserMatchesToken(byId, payload.tokenVersion)) return byId.id;

  const byUsername = await repos.users.findByUsername(payload.username);
  if (activeUserMatchesToken(byUsername, payload.tokenVersion)) return byUsername.id;

  throw new ScanAuthError("Session user is no longer active");
}

export function isScanAuthError(error: unknown): error is ScanAuthError {
  return error instanceof ScanAuthError;
}
