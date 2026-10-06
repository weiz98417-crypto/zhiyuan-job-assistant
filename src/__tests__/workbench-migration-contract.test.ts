/** spec 34:机械换装契约——src/app 页面层不再手写页头块,PageHeading 覆盖 ≥10 个页面文件。 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "src", "app");
const COMPONENTS_DIR = join(process.cwd(), "src", "components");

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
const componentTsxFiles = walkTsx(COMPONENTS_DIR);

/** spec 34 浮层迁移:遮罩/面板统一收口到浮层 kit。fixed inset-0 白名单:
 *  - components/ui/overlay.tsx、components/ui/sheet.tsx:浮层 kit 自身(radix copy-in);
 *  - components/agent/AnalystCanvas.tsx:豁免——全屏工作面而非模态(窄屏覆盖呈现、lg+ 行内画布,
 *    由 agent-dual-canvas-ui.test.tsx 固化),无遮罩/ESC/点外关闭语义,不适用 Dialog。 */
const OVERLAY_WHITELIST = [
  join(process.cwd(), "src", "components", "ui", "overlay.tsx"),
  join(process.cwd(), "src", "components", "ui", "sheet.tsx"),
  join(process.cwd(), "src", "components", "agent", "AnalystCanvas.tsx"),
];

describe("spec 34 工作台换装契约", () => {
  it("src/app 页面层不再出现手写 page-heading 块(原语在 components/ui,不在遍历范围)", () => {
    /** 已记录的豁免(spec 34 评审记录):结构不符合 PageHeading 规范形的两处——
     *  memory:类直接挂在 h1 上(标题即边框盒,无 meta 行);profile:无画像时的居中 hero 页头。 */
    const PAGE_HEADING_WHITELIST = appTsxFiles.filter(
      (file) => file.endsWith(join("memory", "page.tsx")) || (file.endsWith(join("profile", "page.tsx")) && readFileSync(file, "utf-8").includes("page-heading mx-auto")),
    );
    const offenders = appTsxFiles
      .map((file) => ({ file, code: readFileSync(file, "utf-8") }))
      .filter(({ file, code }) => !PAGE_HEADING_WHITELIST.includes(file) && /className="[^"]*page-heading/.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("PageHeading 换装覆盖 ≥10 个页面文件", () => {
    const usingPageHeading = appTsxFiles.filter(
      (file) => readFileSync(file, "utf-8").includes("<PageHeading"),
    );
    expect(usingPageHeading.length).toBeGreaterThanOrEqual(10);
  });

  it("spec 34 浮层契约:fixed inset-0 只允许出现在浮层 kit 与豁免清单内", () => {
    const offenders = [...appTsxFiles, ...componentTsxFiles]
      .filter((file) => !OVERLAY_WHITELIST.includes(file))
      .map((file) => ({ file, code: readFileSync(file, "utf-8") }))
      .filter(({ code }) => code.includes("fixed inset-0"))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
