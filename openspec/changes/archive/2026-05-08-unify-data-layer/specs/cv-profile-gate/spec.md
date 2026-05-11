## ADDED Requirements

### Requirement: check-onboarding.mjs blocks evaluation when CV is placeholder
The system SHALL refuse to execute any evaluation or application workflow when `cv.md` contains only placeholder content.

#### Scenario: Placeholder CV blocks evaluation
- **WHEN** Agent runs `node scripts/check-onboarding.mjs`
- **AND** `cv.md` contains placeholder text (e.g., "请在此处填写您的个人简介") or has fewer than 50 meaningful characters
- **THEN** the script exits with code 1
- **AND** outputs: "CV is incomplete. Please fill in your cv.md with real experience before running evaluations."
- **AND** Agent SHALL NOT proceed with JD evaluation or application generation

#### Scenario: Valid CV allows evaluation
- **WHEN** `check-onboarding.mjs` runs
- **AND** `cv.md` contains substantive content (> 50 chars, no placeholder markers)
- **THEN** the script continues to check profile.yml

### Requirement: check-onboarding.mjs blocks evaluation when profile is template
The system SHALL refuse to execute any evaluation when `config/profile.yml` contains example/template data.

#### Scenario: Template profile blocks evaluation
- **WHEN** `check-onboarding.mjs` reads `config/profile.yml`
- **AND** the `name` field matches example values ("张三", "Your Name", etc.)
- **THEN** the script exits with code 1
- **AND** outputs: "Profile is using template data. Please update config/profile.yml with your real information."
- **AND** Agent SHALL NOT proceed

#### Scenario: Real profile allows evaluation
- **WHEN** `check-onboarding.mjs` reads `config/profile.yml`
- **AND** the `name` field is not an example value AND required fields (email, location, target_roles) are present
- **THEN** the script exits with code 0
- **AND** outputs: "Onboarding check passed."

### Requirement: CLAUDE.md onboarding is hard-blocking
CLAUDE.md SHALL instruct Agent to call `check-onboarding.mjs` as the first step of any evaluation mode. Non-zero exit code SHALL stop all subsequent actions.

#### Scenario: Agent hits hard block
- **WHEN** Agent begins any evaluation mode (jianzhi, oferta, auto-pipeline, pipeline, pdf)
- **THEN** the first action is `node scripts/check-onboarding.mjs`
- **AND** if exit code is non-zero, Agent SHALL display the error message to the user
- **AND** SHALL NOT proceed to extract JD, score, or generate reports

#### Scenario: check-onboarding.mjs is missing
- **WHEN** `check-onboarding.mjs` does not exist at the expected path
- **THEN** Agent SHALL warn "Onboarding check script not found — proceeding without validation"
- **AND** continue with evaluation (graceful degradation, not a hard block)

### Requirement: check-onboarding.mjs checks modes/_profile.md existence
The script SHALL also verify `modes/_profile.md` exists.

#### Scenario: Missing _profile.md
- **WHEN** `check-onboarding.mjs` runs
- **AND** `modes/_profile.md` does not exist
- **THEN** the script exits with code 1
- **AND** outputs: "modes/_profile.md is missing. Run onboarding setup first."
