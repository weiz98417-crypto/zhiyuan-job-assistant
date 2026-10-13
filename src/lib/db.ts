/* ── Dexie.js Database — Local-First Data Layer ── */

import Dexie, { type EntityTable } from "dexie";
import { assertBrowserOwner, requireBrowserOwner, type BrowserOwner } from "@/lib/browser-owner";
import type {
  Application,
  ZhiyuanProfile,
  EvaluationReport,
  Offer,
  StarStory,
  InterviewSchedule,
  JDRecord,
  PracticeRecord,
  AgentInteraction,
  AgentDecision,
  AgentPreferenceModel,
  ChatSession,
} from "@/types";

export class ZhiyuanDB extends Dexie {
  applications!: EntityTable<Application, "id">;
  reports!: EntityTable<EvaluationReport, "id">;
  offers!: EntityTable<Offer, "id">;
  stories!: EntityTable<StarStory, "id">;
  interviews!: EntityTable<InterviewSchedule, "id">;
  jds!: EntityTable<JDRecord, "id">;
  practiceRecords!: EntityTable<PracticeRecord, "id">;
  profiles!: EntityTable<ZhiyuanProfile, "id">;
  agentInteractions!: EntityTable<AgentInteraction, "id">;
  agentDecisions!: EntityTable<AgentDecision, "id">;
  agentPreferences!: EntityTable<AgentPreferenceModel, "id">;
  chatSessions!: EntityTable<ChatSession, "id">;

  constructor(name = "zhiyuan", owner?: BrowserOwner) {
    super(name);

    this.version(1).stores({
      applications:
        "++id, num, company, role, status, score, date, createdAt",
      reports:
        "++id, reportNum, company, role, overallScore, archetype, applicationId, createdAt",
      offers:
        "++id, company, role, monthlySalary, applicationId, createdAt",
      stories:
        "++id, title, *tags, createdAt",
      interviews:
        "++id, company, date, applicationId",
    });

    this.version(2).stores({
      jds: "++id, company, role, sourceType, reportId, createdAt",
    });

    this.version(3).stores({
      practiceRecords: "++id, questionCategory, *tags, createdAt",
    });

    this.version(4).stores({
      profiles: "++id, lastUpdated",
    });

    this.version(5).stores({
      agentInteractions: "++id, timestamp, trigger",
      agentDecisions: "++id, timestamp, type, userResponse",
      agentPreferences: "++id, lastUpdated",
    });

    this.version(6).stores({
      chatSessions: "++id, title, pinned, createdAt, updatedAt",
    });
    if (owner) {
      this.use({
        stack: "dbcore",
        name: "owner-isolation",
        create: (core) => ({
          ...core,
          table: (tableName) => {
            const table = core.table(tableName);
            const guard = <Request, Result>(operation: (request: Request) => Promise<Result>) => async (request: Request): Promise<Result> => {
              assertBrowserOwner(owner);
              const result = await operation(request);
              assertBrowserOwner(owner);
              return result;
            };
            return {
              ...table,
              get: guard(table.get.bind(table)),
              getMany: guard(table.getMany.bind(table)),
              count: guard(table.count.bind(table)),
              query: guard(table.query.bind(table)),
              openCursor: guard(table.openCursor.bind(table)),
              mutate: guard(table.mutate.bind(table)),
            };
          },
        }),
      });
    }
  }
}

let activeDatabase: ZhiyuanDB | null = null;
let databaseGeneration = -1;

export function captureOwnerDatabase(owner = requireBrowserOwner()): ZhiyuanDB {
  assertBrowserOwner(owner);
  if (!activeDatabase || databaseGeneration !== owner.generation) {
    activeDatabase?.close({ disableAutoOpen: true });
    activeDatabase = new ZhiyuanDB("zhiyuan:owner:" + encodeURIComponent(owner.ownerId), owner);
    databaseGeneration = owner.generation;
  }
  return activeDatabase;
}

const db = new Proxy({} as ZhiyuanDB, {
  get(_target, property) {
    const database = captureOwnerDatabase();
    const value = Reflect.get(database, property);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
export default db;

export async function clearLocalBusinessData(): Promise<void> {
  const owner = requireBrowserOwner();
  const database = captureOwnerDatabase(owner);
  const tables = database.tables;
  await database.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
    for (const table of tables) {
      if (await table.count() !== 0) throw new Error("本地数据清除后读回不一致");
    }
    assertBrowserOwner(owner);
  });
  const { clearOwnerStorage } = await import("@/lib/browser-owner");
  clearOwnerStorage(owner);
}
