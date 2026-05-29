import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const VIEWPORT = { width: 1920, height: 1080 };
const SCREENSHOT_DIR = 'E:/求职项目/求职助手/frontend/screenshots';

// Pages to verify with their expected layout features
const PAGES = [
  {
    name: 'evaluate',
    url: `${BASE_URL}/evaluate`,
    checks: [
      'dual-column layout on XL (right sidebar for deep analysis)',
      'no horizontal scrollbar',
    ],
  },
  {
    name: 'cv',
    url: `${BASE_URL}/cv`,
    checks: [
      'grid layout `xl:grid-cols-[1fr_360px]`',
      'JD matching panel sticky on right side',
      'no horizontal scrollbar',
    ],
  },
  {
    name: 'evaluate-jds',
    url: `${BASE_URL}/evaluate/jds`,
    checks: [
      '3-column card grid (`xl:grid-cols-3`)',
      'no horizontal scrollbar',
    ],
  },
  {
    name: 'evaluate-reports',
    url: `${BASE_URL}/evaluate/reports`,
    checks: [
      '3-column card grid (`xl:grid-cols-3`)',
      'detail panel `xl:max-w-lg`',
      'no horizontal scrollbar',
    ],
  },
];

async function main() {
  // Ensure screenshot directory exists
  const fs = await import('fs');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const pageInfo of PAGES) {
    console.log(`\n=== Testing: ${pageInfo.name} (${pageInfo.url}) ===`);

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
      // Navigate and wait for load
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 30000 });
      // Extra wait for any animations
      await page.waitForTimeout(1000);

      // Take screenshot
      const screenshotPath = `${SCREENSHOT_DIR}/desktop-${pageInfo.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`  Screenshot saved: ${screenshotPath}`);

      // Check for horizontal overflow
      const overflowInfo = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        return {
          htmlScrollWidth: html.scrollWidth,
          htmlClientWidth: html.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          bodyClientWidth: body.clientWidth,
          viewportWidth: window.innerWidth,
          hasHorizontalScrollbar: html.scrollWidth > html.clientWidth,
          overflowX: getComputedStyle(html).overflowX,
          bodyOverflowX: getComputedStyle(body).overflowX,
        };
      });

      console.log('  Overflow check:', JSON.stringify(overflowInfo, null, 2));

      // Check for main content container width
      const mainInfo = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return { found: false };
        const style = getComputedStyle(main);
        return {
          found: true,
          width: main.offsetWidth,
          maxWidth: style.maxWidth,
          classList: [...main.classList],
        };
      });
      console.log('  Main container:', JSON.stringify(mainInfo, null, 2));

      // Specific checks per page
      let specificChecks = {};

      if (pageInfo.name === 'evaluate') {
        specificChecks = await page.evaluate(() => {
          // Check for dual-column layout - look for 2-column grid or flex
          const main = document.querySelector('main');
          const allGrids = main?.querySelectorAll('[class*="grid"], [class*="flex"]') || [];
          const gridInfo = [];
          allGrids.forEach((el, i) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (rect.width > 500) { // Only large containers
              gridInfo.push({
                index: i,
                tag: el.tagName,
                display: style.display,
                gridTemplateColumns: style.gridTemplateColumns,
                width: rect.width,
                classList: [...el.classList].filter(c => c.includes('grid') || c.includes('col') || c.includes('xl')),
              });
            }
          });
          return { gridLayouts: gridInfo };
        });
        console.log('  Dual-column check:', JSON.stringify(specificChecks, null, 2));
      }

      if (pageInfo.name === 'cv') {
        specificChecks = await page.evaluate(() => {
          // Check for grid with 1fr 360px
          const grids = document.querySelectorAll('[class*="grid-cols"]');
          const gridInfo = [];
          grids.forEach((el, i) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            gridInfo.push({
              index: i,
              display: style.display,
              gridTemplateColumns: style.gridTemplateColumns,
              width: rect.width,
              classList: [...el.classList].filter(c => c.includes('grid') || c.includes('col') || c.includes('xl')),
            });
          });

          // Check for sticky elements on right side
          const stickies = document.querySelectorAll('[class*="sticky"]');
          const stickyInfo = [];
          stickies.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            stickyInfo.push({
              index: i,
              tag: el.tagName,
              position: getComputedStyle(el).position,
              right: rect.right,
              left: rect.left,
              width: rect.width,
              text: el.textContent?.substring(0, 80),
            });
          });

          return { gridLayouts: gridInfo, stickyElements: stickyInfo };
        });
        console.log('  CV layout check:', JSON.stringify(specificChecks, null, 2));
      }

      if (pageInfo.name === 'evaluate-jds') {
        specificChecks = await page.evaluate(() => {
          // Look for 3-column grid
          const grids = document.querySelectorAll('[class*="grid-cols"]');
          const gridInfo = [];
          grids.forEach((el, i) => {
            const style = getComputedStyle(el);
            gridInfo.push({
              index: i,
              gridTemplateColumns: style.gridTemplateColumns,
              childCount: el.children.length,
              classList: [...el.classList].filter(c => c.includes('grid') || c.includes('col')),
            });
          });
          return { grids: gridInfo };
        });
        console.log('  JD grid check:', JSON.stringify(specificChecks, null, 2));
      }

      if (pageInfo.name === 'evaluate-reports') {
        specificChecks = await page.evaluate(() => {
          const grids = document.querySelectorAll('[class*="grid-cols"]');
          const gridInfo = [];
          grids.forEach((el, i) => {
            const style = getComputedStyle(el);
            gridInfo.push({
              index: i,
              gridTemplateColumns: style.gridTemplateColumns,
              childCount: el.children.length,
              classList: [...el.classList].filter(c => c.includes('grid') || c.includes('col')),
            });
          });

          // Check for max-w-lg detail panel
          const maxWLg = document.querySelectorAll('[class*="max-w-lg"]');
          const panelInfo = [];
          maxWLg.forEach((el, i) => {
            panelInfo.push({
              index: i,
              tag: el.tagName,
              width: el.getBoundingClientRect().width,
              maxWidth: getComputedStyle(el).maxWidth,
            });
          });

          return { grids: gridInfo, maxWLgPanels: panelInfo };
        });
        console.log('  Reports check:', JSON.stringify(specificChecks, null, 2));
      }

      const hasScrollbar = overflowInfo.hasHorizontalScrollbar;
      const passed = !hasScrollbar;

      results.push({
        page: pageInfo.name,
        passed,
        hasHorizontalScrollbar: hasScrollbar,
        overflowInfo,
        specificChecks,
      });

    } catch (err) {
      console.error(`  ERROR on ${pageInfo.name}:`, err.message);
      results.push({
        page: pageInfo.name,
        passed: false,
        error: err.message,
      });
    } finally {
      await context.close();
    }
  }

  await browser.close();

  // Print summary
  console.log('\n========================================');
  console.log('         DESKTOP LAYOUT VERIFICATION');
  console.log('========================================');
  console.log(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log('');

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} | ${r.page}`);
    if (r.hasHorizontalScrollbar) {
      console.log(`     WARNING: Horizontal scrollbar detected!`);
      console.log(`     scrollWidth=${r.overflowInfo?.htmlScrollWidth} > clientWidth=${r.overflowInfo?.htmlClientWidth}`);
    }
    if (r.error) {
      console.log(`     ERROR: ${r.error}`);
    }
    for (const check of PAGES.find(p => p.name === r.page)?.checks || []) {
      console.log(`     - ${check}`);
    }
  }

  console.log('\nScreenshots saved to: E:/求职项目/求职助手/frontend/screenshots/');
}

main().catch(console.error);
