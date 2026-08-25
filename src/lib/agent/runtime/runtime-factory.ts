import { getDatabaseDriver, isPostgresConfigured } from "@/lib/postgres";
import { DurableAgentRunService } from "@/lib/agent/runtime/durable-agent-run";
import { PostgresAgentRunStore } from "@/lib/agent/runtime/postgres-agent-run-store";

let runtime: DurableAgentRunService | null = null;

export function isDurableAgentRuntimeAvailable(): boolean {
  return getDatabaseDriver() === "postgres" && isPostgresConfigured();
}

export function getDurableAgentRuntime(): DurableAgentRunService {
  if (!isDurableAgentRuntimeAvailable()) {
    throw new Error("Durable Agent Runtime requires DB_DRIVER=postgres and DATABASE_URL");
  }
  if (!runtime) runtime = new DurableAgentRunService(new PostgresAgentRunStore());
  return runtime;
}
