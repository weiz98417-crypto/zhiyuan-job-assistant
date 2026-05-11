## ADDED Requirements

### Requirement: ChatSession data model
The system SHALL define a `ChatSession` type with fields: id (auto-increment), title (string), messages (array of AgentMessage), memoryDigest (optional string), pinned (boolean), createdAt (ISO string), updatedAt (ISO string). Sessions SHALL be persisted in DexieDB v6 `chatSessions` table.

#### Scenario: New session created with default title
- **WHEN** user creates a new chat session
- **THEN** session is created with title "新对话" and contains the WELCOME message

#### Scenario: Session title auto-generated from first message
- **WHEN** user sends their first message in a session
- **THEN** session title updates to first 20 characters of user message, extracting company/role keywords if present (e.g., "分析JD: 字节前端")

### Requirement: Session CRUD operations
The system SHALL provide `createSession`, `listSessions`, `deleteSession`, `updateSession`, `pinSession`, and `searchSessions` functions in `src/lib/agent/sessions.ts`.

#### Scenario: List sessions ordered by most recent
- **WHEN** user loads the session list
- **THEN** sessions are sorted by `updatedAt` descending, with pinned sessions at the top

#### Scenario: Soft delete with undo toast
- **WHEN** user deletes a session
- **THEN** session is marked with `deletedAt`, a toast appears with "已删除 · 撤回" button, and after 5 seconds the session is permanently deleted

#### Scenario: Undo delete
- **WHEN** user clicks "撤回" within 5 seconds of deleting
- **THEN** session is restored with `deletedAt` cleared

### Requirement: Message limit per session
Each session SHALL be limited to 200 messages. When the limit is reached, the system SHALL show a warning and suggest creating a new session.

#### Scenario: Approaching message limit
- **WHEN** session reaches 190 messages
- **THEN** a subtle warning appears: "会话即将达到上限，建议新建对话"
