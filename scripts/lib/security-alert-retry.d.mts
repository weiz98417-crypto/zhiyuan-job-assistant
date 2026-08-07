export interface RetryDatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface SecurityAlertRetryResult {
  lockAcquired: boolean;
  selected: number;
  succeeded: number;
  deferred: number;
  abandoned: number;
}

export function runSecurityAlertRetryBatch(options: {
  client: RetryDatabaseClient;
  fetchImpl?: typeof fetch;
  environment?: Record<string, string | undefined>;
  now?: Date;
  randomUUID?: () => string;
  batchSize?: number;
  maxAttempts?: number;
}): Promise<SecurityAlertRetryResult>;
