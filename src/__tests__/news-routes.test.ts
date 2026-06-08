import { afterEach, describe, expect, it, vi } from "vitest";

function mockLegacyServerDbFailure() {
  vi.doMock("@/lib/server-db", () => ({
    getCachedNews: () => {
      throw new Error("legacy SQLite news cache should not be called");
    },
    cacheNews: () => {
      throw new Error("legacy SQLite news cache should not be called");
    },
    cleanExpiredNews: () => {
      throw new Error("legacy SQLite news cache should not be called");
    },
    isNewsCacheFresh: () => {
      throw new Error("legacy SQLite news cache should not be called");
    },
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("@/lib/data-repositories");
  vi.doUnmock("@/lib/server-db");
});

describe("news routes", () => {
  it("serves industry news from the selected data repository cache", async () => {
    vi.resetModules();
    mockLegacyServerDbFailure();

    const news = {
      cache: vi.fn(),
      cleanExpired: vi.fn(),
      isFresh: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue([
        {
          id: 1,
          source: "industry",
          source_name: "OpenAI",
          title: "AI hiring signal",
          summary: "AI company expands product team",
          url: "https://example.com/news",
          published_at: "2026-06-05T00:00:00.000Z",
          cached_at: "2026-06-05T01:00:00.000Z",
        },
      ]),
    };
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({ news }),
    }));

    const route = await import("@/app/api/news/industry/route");
    const response = await route.GET(new Request("http://localhost/api/news/industry"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cached).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].source).toBe("OpenAI");
    expect(news.isFresh).toHaveBeenCalledWith("industry", 6);
    expect(news.list).toHaveBeenCalledWith("industry", 10);
    expect(news.cleanExpired).not.toHaveBeenCalled();
  });

  it("falls back to raw RSS titles when industry summarization returns no items", async () => {
    vi.resetModules();
    mockLegacyServerDbFailure();

    let cachedRows: Record<string, unknown>[] = [];
    const news = {
      cache: vi.fn(async (items: Record<string, unknown>[]) => {
        cachedRows = items.map((item, index) => ({
          id: index + 1,
          cached_at: "2026-06-05T01:00:00.000Z",
          ...item,
        }));
      }),
      cleanExpired: vi.fn(),
      isFresh: vi.fn().mockResolvedValue(false),
      list: vi.fn(async () => cachedRows),
    };
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({ news }),
    }));

    const rss = `
      <rss><channel>
        <item>
          <title>AI models reshape product hiring</title>
          <link>https://example.com/ai-hiring</link>
          <description>AI product teams keep hiring PMs.</description>
        </item>
      </channel></rss>
    `;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.deepseek.com")) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"summaries\":[]}" } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(rss, { status: 200, headers: { "Content-Type": "application/xml" } });
    }));

    const route = await import("@/app/api/news/industry/route");
    const response = await route.GET(new Request("http://localhost/api/news/industry?force=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].title).toBe("AI models reshape product hiring");
    expect(news.cache).toHaveBeenCalled();
    expect(news.cleanExpired).toHaveBeenCalledWith(24);
  });

  it("serves company news for the current user's target companies only", async () => {
    vi.resetModules();
    mockLegacyServerDbFailure();

    vi.doMock("@/lib/auth", () => ({
      getCurrentUser: async () => ({
        userId: "user-news-1",
        username: "news-user",
        role: "member",
        tokenVersion: 0,
      }),
    }));

    const news = {
      cache: vi.fn(),
      cleanExpired: vi.fn(),
      isFresh: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue([
        {
          id: 1,
          source: "company",
          source_name: "OpenAI",
          title: "OpenAI product hiring",
          summary: "Product roles are active",
          url: null,
          published_at: "2026-06-05T00:00:00.000Z",
          cached_at: "2026-06-05T01:00:00.000Z",
        },
        {
          id: 2,
          source: "company",
          source_name: "OtherCo",
          title: "OtherCo hiring",
          summary: "Should be filtered out",
          url: null,
          published_at: "2026-06-05T00:00:00.000Z",
          cached_at: "2026-06-05T01:00:00.000Z",
        },
      ]),
    };
    const profiles = {
      get: vi.fn().mockResolvedValue({
        goals_json: JSON.stringify({ target_companies: ["OpenAI"] }),
      }),
    };
    vi.doMock("@/lib/data-repositories", () => ({
      getDataRepositories: () => ({ news, profiles }),
    }));

    const route = await import("@/app/api/news/company/route");
    const response = await route.GET(new Request("http://localhost/api/news/company"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cached).toBe(true);
    expect(json.hasTargets).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].source).toBe("OpenAI");
    expect(profiles.get).toHaveBeenCalledWith("user-news-1");
    expect(news.list).toHaveBeenCalledWith("company", 50);
    expect(news.cleanExpired).not.toHaveBeenCalled();
  });
});
