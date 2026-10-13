import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateSqliteOfferUnknownTerms } from "@/lib/server/offer-schema-migration";

describe("Offer unknown-term schema migration", () => {
  it("allows unknown new terms while preserving historical values, IDs, links and indexes", () => {
    const database = new Database(":memory:");
    try {
      database.pragma("foreign_keys = ON");
      database.exec(`
        CREATE TABLE offers (
          id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT NOT NULL,
          annual_bonus REAL DEFAULT 0, has_social_insurance INTEGER NOT NULL DEFAULT 1,
          housing_fund_rate INTEGER NOT NULL DEFAULT 7, probation_months INTEGER NOT NULL DEFAULT 3
        );
        CREATE INDEX idx_offer_company ON offers(company);
        CREATE TABLE reports (id INTEGER PRIMARY KEY, offer_id INTEGER REFERENCES offers(id));
        INSERT INTO offers (id, company) VALUES (17, '历史值需复核');
        INSERT INTO offers (id, company) VALUES (30, '已删除历史记录');
        DELETE FROM offers WHERE id=30;
        INSERT INTO reports (id, offer_id) VALUES (9, 17);
      `);
      migrateSqliteOfferUnknownTerms(database);
      migrateSqliteOfferUnknownTerms(database);
      expect(database.prepare("SELECT * FROM offers WHERE id=17").get()).toMatchObject({
        id: 17, annual_bonus: 0, has_social_insurance: 1, housing_fund_rate: 7, probation_months: 3,
      });
      database.prepare("INSERT INTO offers(company, annual_bonus, has_social_insurance, housing_fund_rate, probation_months) VALUES(?, NULL, NULL, NULL, NULL)").run("新未知条件");
      expect(database.prepare("SELECT * FROM offers WHERE company=?").get("新未知条件")).toMatchObject({
        id: 31, annual_bonus: null, has_social_insurance: null, housing_fund_rate: null, probation_months: null,
      });
      expect(database.prepare("SELECT offer_id FROM reports WHERE id=9").get()).toEqual({ offer_id: 17 });
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name='idx_offer_company'").get()).toBeTruthy();
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      database.close();
    }
  });
});
