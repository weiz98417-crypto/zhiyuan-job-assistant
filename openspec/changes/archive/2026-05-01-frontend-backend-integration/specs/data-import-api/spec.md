## ADDED Requirements

### Requirement: Import applications from CLI data
The system SHALL read `data/applications.md` from the project root and return parsed application records as JSON.

#### Scenario: Parse applications table
- **WHEN** `data/applications.md` contains a markdown table with columns #, Date, Company, Role, Score, Status, PDF, Report, Notes
- **THEN** returned `applications` array contains objects with parsed fields matching `Application` type

#### Scenario: No applications file
- **WHEN** `data/applications.md` does not exist
- **THEN** `applications` field is an empty array

### Requirement: Import reports from CLI data
The system SHALL read all `reports/*.md` files and return parsed evaluation report data.

#### Scenario: Parse report metadata
- **WHEN** a report file contains `**Date:**`, `**Score:**`, `**Archetype:**` headers
- **THEN** returned report object includes date, overallScore, archetype, legitimacy, blocks A-G, and keywords

#### Scenario: Limit report count
- **WHEN** there are more than 100 report files
- **THEN** only the most recent 50 reports are returned (by file modification time)

### Requirement: Import profile from CLI config
The system SHALL read `config/profile.yml` and return parsed profile data.

#### Scenario: Profile exists
- **WHEN** `config/profile.yml` contains valid YAML with fullName, email, targetRoles
- **THEN** returned `profile` object maps to `UserProfile` type fields

#### Scenario: Profile not set up
- **WHEN** only `config/profile.example.yml` exists (not `profile.yml`)
- **THEN** `profile` field is null with no error

### Requirement: Import pipeline entries
The system SHALL read `data/pipeline.md` and return unchecked pipeline entries.

#### Scenario: Pipeline has entries
- **WHEN** `data/pipeline.md` contains `- [ ]` (unchecked) markdown items with URLs
- **THEN** returned `pipeline` array contains objects with company, role, and url fields
