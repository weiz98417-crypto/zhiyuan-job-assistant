## ADDED Requirements

### Requirement: Session list sidebar
The system SHALL render a `SessionList` sidebar component showing all user sessions. On desktop (>=1280px), the sidebar SHALL be always visible. On mobile, it SHALL be accessible via a slide-in drawer. Each session item SHALL show title, message count, and relative timestamp.

#### Scenario: Desktop sidebar with sessions
- **WHEN** user has 3+ sessions on a desktop screen
- **THEN** sidebar is visible on the left showing session titles, message counts, and timestamps

#### Scenario: Mobile drawer toggle
- **WHEN** user is on a mobile screen
- **THEN** a hamburger or sessions icon triggers a slide-in drawer showing the session list

### Requirement: New chat button
The system SHALL provide a "新建对话" button (+) that creates a new empty session and switches to it immediately. The "重新开始" reset button SHALL be removed.

#### Scenario: Create new session
- **WHEN** user clicks "新建对话" button
- **THEN** a new session is created with WELCOME message, sidebar shows it as the active session, and chat area clears

#### Scenario: No reset button present
- **WHEN** viewing the AgentChat UI
- **THEN** there is no "重新开始" button; only "新建对话" and session management controls

### Requirement: Session switching
The system SHALL load the selected session's messages when user clicks a session in the sidebar. Active session SHALL be visually highlighted. Switching during streaming SHALL abort the current stream first.

#### Scenario: Switch between sessions
- **WHEN** user clicks on "面试准备" session while viewing "分析JD" session
- **THEN** chat area loads "面试准备" messages, sidebar highlights it, and "分析JD" messages are preserved

#### Scenario: Switch during streaming aborts
- **WHEN** user switches session while agent is streaming a response
- **THEN** current stream is aborted before loading new session messages

### Requirement: Session deletion
The system SHALL allow users to delete sessions via a delete button (trash icon) on each session item. Deletion SHALL use soft-delete with 5-second undo window.

#### Scenario: Delete session from sidebar
- **WHEN** user clicks delete icon on a session
- **THEN** session disappears from list, toast shows "已删除 · 撤回", and if no undo within 5 seconds, session is removed from DexieDB

### Requirement: Session search
The system SHALL provide a search input in the sidebar that filters sessions by title and message content in real-time.

#### Scenario: Search finds matching session
- **WHEN** user types "字节" in session search
- **THEN** only sessions whose title or messages contain "字节" are shown
