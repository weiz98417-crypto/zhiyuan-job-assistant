## ADDED Requirements

### Requirement: Session sidebar has overflow hidden
The session sidebar wrapper SHALL apply `overflow-hidden` to prevent content from spilling into the main chat area.

#### Scenario: Long session title does not overflow
- **WHEN** a session title exceeds the sidebar width
- **THEN** the text is clipped by `overflow-hidden` and `truncate` on the sidebar and item containers

### Requirement: Session sidebar width is 260px
The session sidebar SHALL be 260px wide on desktop screens (`lg` breakpoint and above).

#### Scenario: Desktop sidebar renders at 260px
- **WHEN** viewport width is >= 1024px
- **THEN** the session sidebar has `w-[260px]` class applied
- **AND** the main chat area has `ml-4` left margin for visual separation
