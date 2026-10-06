/** spec 34:机械换装契约——src/app 页面层不再手写页头块,PageHeading 覆盖 ≥10 个页面文件。 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "src", "app");

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsx(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const appTsxFiles = walkTsx(APP_DIR);

describe("spec 34 工作台换装契约", () => {
  it("src/app 页面层不再出现手写 page-heading 块(原语在 components/ui,不在遍历范围)", () => {
    const offenders = appTsxFiles
      .map((file) => ({ file, code: readFileSync(file, "utf-8") }))
      .filter(({ code }) => code.includes('className="page-heading"'))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("PageHeading 换装覆盖 ≥10 个页面文件", () => {
    const usingPageHeading = appTsxFiles.filter(
      (file) => readFileSync(file, "utf-8").includes("<PageHeading"),
    );
    expect(usingPageHeading.length).toBeGreaterThanOrEqual(10);
  });
});
