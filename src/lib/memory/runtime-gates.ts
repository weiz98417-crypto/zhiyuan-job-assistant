import { withPostgresClient } from "@/lib/postgres";

export type MemoryRuntimeGate = "read" | "write" | "extract";

export async function assertMemoryGateOpen(gate: MemoryRuntimeGate): Promise<void> {
  const result = await withPostgresClient((client) => client.query(
    "SELECT state, reason FROM memory_runtime_gates WHERE gate_name=$1",
    [gate],
  ));
  const row = result.rows[0];
  if (!row || String(row.state) !== "open") {
    throw new Error(`Memory ${gate} gate is closed: ${String(row?.reason || "release gate is not configured")}`);
  }
}

export async function assertMemoryWriteGateOpen(): Promise<void> {
  await assertMemoryGateOpen("write");
}

export async function assertMemoryExtractionGateOpen(): Promise<void> {
  await assertMemoryGateOpen("extract");
}
