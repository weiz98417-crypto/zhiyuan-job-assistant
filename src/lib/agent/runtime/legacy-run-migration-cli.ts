import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient } from "pg";
import {
  LegacyRunMigrationService,
  type LegacyRunMigrationApproval,
  type LegacyRunMigrationBatch,
  type LegacyRunRollbackBatch,
} from "@/lib/agent/runtime/legacy-run-migration";

type Command = "inspect" | "apply" | "inspect-rollback" | "rollback";

interface CliArguments {
  command: Command;
  databaseUrl: string;
  userId: string;
  operatorId: string;
  outputPath: string;
  runIds: string[];
  migrationIds: string[];
  manifestPath?: string;
  approvalPath?: string;
}

const help = `Legacy Run maintenance (explicit target, owner and reviewed scope)
node scripts/legacy-run-migration.mjs inspect --database-url URL --owner USER --operator OPERATOR --run RUN_ID --output FILE
node scripts/legacy-run-migration.mjs apply --database-url URL --owner USER --operator OPERATOR --manifest FILE --approval FILE --output FILE
node scripts/legacy-run-migration.mjs inspect-rollback --database-url URL --owner USER --operator OPERATOR --migration MIGRATION_ID --output FILE
node scripts/legacy-run-migration.mjs rollback --database-url URL --owner USER --operator OPERATOR --manifest FILE --approval FILE --output FILE
Repeat --run or --migration for a batch. Existing output files are never overwritten.
Approval JSON: {approvalId, approvedBy, operatorId, scopeHash: manifest.approvalScopeHash, entryIds: all reviewed manifest entryIds}.
Inspect is read-only. Rollback preserves the original Run and audit, keeps Worker execution paused, and refuses newer data.
The command never reads DATABASE_URL or .env files and does not enable a production executor.`;

export async function runLegacyRunMigrationCli(argv: string[]): Promise<{ exitCode: number; outputPath?: string; batchId?: string; help?: string }> {
  if (argv.includes("--help") || argv.includes("-h")) return { exitCode: 0, help };
  const args = parseArguments(argv);
  const principal = { userId: args.userId };
  const mutation = args.command === "apply" || args.command === "rollback";
  const manifest = mutation ? readObject(args.manifestPath!, "manifest") as unknown as LegacyRunMigrationBatch | LegacyRunRollbackBatch : null;
  const approval = mutation ? readObject(args.approvalPath!, "approval") as unknown as LegacyRunMigrationApproval : null;
  if (manifest && (manifest.userId !== args.userId || manifest.operatorId !== args.operatorId || manifest.operation !== args.command)) {
    throw new Error("Reviewed manifest owner, operator or operation differs from the explicit CLI scope");
  }
  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const descriptor = fs.openSync(args.outputPath, "wx", 0o600);
  const pool = new Pool({ connectionString: args.databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const withClient = async <Result>(operation: (client: PoolClient) => Promise<Result>) => {
    const client = await pool.connect();
    try { return await operation(client); } finally { client.release(); }
  };
  const service = new LegacyRunMigrationService(withClient);
  try {
    const result = args.command === "inspect"
      ? await service.inspectBatch(principal, { operatorId: args.operatorId, runIds: args.runIds })
      : args.command === "inspect-rollback"
      ? await service.inspectRollbackBatch(principal, { operatorId: args.operatorId, migrationIds: args.migrationIds })
      : args.command === "apply"
      ? await service.applyBatch(principal, manifest as LegacyRunMigrationBatch, approval!)
      : await service.rollbackBatch(principal, manifest as LegacyRunRollbackBatch, approval!);
    fs.writeFileSync(descriptor, JSON.stringify(result, null, 2) + "\n", "utf8");
    return { exitCode: "canClaimSuccess" in result && !result.canClaimSuccess ? 2 : 0, outputPath: args.outputPath, batchId: result.batchId };
  } catch (error) {
    fs.writeFileSync(descriptor, JSON.stringify({ operation: args.command, canClaimSuccess: false,
      error: error instanceof Error ? error.message : "Legacy maintenance failed",
      nextAction: "Inspect the durable migration receipts before retrying; no success is claimed." }, null, 2) + "\n", "utf8");
    throw error;
  } finally {
    fs.closeSync(descriptor);
    await pool.end();
  }
}

function parseArguments(argv: string[]): CliArguments {
  const command = argv[0] as Command;
  if (!["inspect", "apply", "inspect-rollback", "rollback"].includes(command)) throw new Error("Use inspect, apply, inspect-rollback or rollback; --help lists their explicit scopes");
  const values = new Map<string, string>();
  const runIds: string[] = [];
  const migrationIds: string[] = [];
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--database-url", "--owner", "--operator", "--output", "--run", "--migration", "--manifest", "--approval"].includes(flag)
      || !value || value.startsWith("--")) throw new Error("Unknown argument or missing value: " + flag);
    if (flag === "--run") runIds.push(value);
    else if (flag === "--migration") migrationIds.push(value);
    else {
      if (values.has(flag)) throw new Error("Repeated argument: " + flag);
      values.set(flag, value);
    }
  }
  const required = (flag: string) => {
    const value = values.get(flag);
    if (!value?.trim()) throw new Error("An explicit " + flag + " is required");
    return value;
  };
  const databaseUrl = required("--database-url");
  const target = new URL(databaseUrl);
  if (!["postgresql:", "postgres:"].includes(target.protocol)) throw new Error("--database-url must explicitly identify a PostgreSQL target");
  const userId = required("--owner");
  const operatorId = required("--operator");
  if (command === "inspect" && (!runIds.length || migrationIds.length)) throw new Error("inspect requires an explicit --run scope");
  if (command === "inspect-rollback" && (!migrationIds.length || runIds.length)) throw new Error("inspect-rollback requires an explicit --migration scope");
  if ((command === "apply" || command === "rollback") && (runIds.length || migrationIds.length)) throw new Error("Apply and rollback take their scope only from --manifest and --approval");
  const outputPath = path.resolve(required("--output"));
  const mutation = command === "apply" || command === "rollback";
  return { command, databaseUrl, userId, operatorId, outputPath, runIds, migrationIds,
    manifestPath: mutation ? path.resolve(required("--manifest")) : undefined,
    approvalPath: mutation ? path.resolve(required("--approval")) : undefined };
}

function readObject(filename: string, label: string): Record<string, unknown> {
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reviewed " + label + " must be a JSON object");
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runLegacyRunMigrationCli(process.argv.slice(2)).then((result) => {
    process.stdout.write((result.help || JSON.stringify(result)) + "\n");
    process.exitCode = result.exitCode;
  }).catch((error) => {
    process.stderr.write("Legacy maintenance: " + (error instanceof Error ? error.message : "Failed") + "\n");
    process.exitCode = 1;
  });
}
