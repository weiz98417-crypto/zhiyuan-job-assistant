/* ── Dexie.js Database — Local-First Data Layer ── */

import Dexie, { type EntityTable } from "dexie";
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

  constructor() {
    super("zhiyuan");

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
  }
}

const db = new ZhiyuanDB();
export default db;
