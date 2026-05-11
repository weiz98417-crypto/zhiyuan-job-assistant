## ADDED Requirements

### Requirement: Pipeline processes URLs in explicit serial order
`modes/pipeline.md` SHALL instruct Agent to process URLs sequentially, NOT in parallel.

#### Scenario: Pipeline with 5 URLs
- **WHEN** `pipeline.md` has 5 pending URLs
- **THEN** Agent processes them one at a time in order
- **AND** does NOT launch parallel agents

### Requirement: API-scannable URLs processed first
Agent SHALL process URLs detectable by `scan.mjs` (API-based) before URLs requiring Playwright.

#### Scenario: Mixed URL types
- **WHEN** pipeline has 2 Greenhouse URLs (API) + 2 LinkedIn URLs (Playwright) + 1 Boss直聘 URL (Playwright)
- **THEN** Agent calls `node scan.mjs` to batch-process the 2 API URLs
- **AND** then processes the 3 Playwright URLs one at a time

### Requirement: Playwright rule references pipeline mode explicitly
`modes/_shared.md:123` and `modes/zh/_shared.md:150` SHALL be updated to reference pipeline mode.

#### Scenario: Developer reads Playwright rule
- **WHEN** a developer or Agent reads the Playwright parallel prohibition
- **THEN** the rule states: "NEVER 2+ agents with Playwright in parallel. This includes pipeline mode — process Playwright URLs one at a time."

### Requirement: Removed parallel agent recommendation
The instruction "lanzar agentes en paralelo" at `pipeline.md:14` SHALL be removed entirely.

#### Scenario: Agent reads updated pipeline.md
- **WHEN** Agent opens `pipeline.md` for pipeline processing instructions
- **THEN** no instruction to launch parallel agents is present
- **AND** the serial order (API → Playwright) is clearly described
