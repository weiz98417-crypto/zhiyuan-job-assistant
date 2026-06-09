# Spec Delta: Interview Prep UI

## MODIFIED Requirements

### Requirement: 面试准备页职责边界

Interview Prep SHALL act as a preparation, session launch, history, and review surface. It SHALL NOT control live interview question selection or scoring after a session has started.

#### Scenario: 从准备页开始真实模拟面试

- **WHEN** the user selects a JD, resume, mode, difficulty, and focus areas in Interview Prep
- **AND** clicks start mock interview
- **THEN** the system creates an `InterviewPlanSnapshot`
- **AND** opens or creates an AgentChat interview session using that snapshot
- **AND** the live interview proceeds in AgentChat

#### Scenario: 准备页设置不影响进行中的面试

- **WHEN** the user starts an interview session from Interview Prep
- **AND** later changes JD, resume, mode, difficulty, or focus settings in Interview Prep
- **THEN** those changes SHALL apply only to future sessions
- **AND** the active AgentChat session SHALL continue using its stored `InterviewPlanSnapshot`

#### Scenario: 准备页可查看历史复盘

- **WHEN** the user opens Interview Prep
- **THEN** the page SHALL show prior mock interview sessions created by AgentChat
- **AND** each history item SHALL allow opening the transcript or recap
- **AND** viewing a recap SHALL NOT mutate the original session state

### Requirement: JD 和简历来源

Interview Prep SHALL select JD and resume records from their canonical management stores and SHALL freeze their content into the session snapshot at start time.

#### Scenario: 使用管理页素材生成快照

- **WHEN** the user starts a mock interview with selected JD and resume records
- **THEN** the snapshot SHALL include both source ids and text snapshots
- **AND** the snapshot SHALL preserve company, role, resume title, and created time

#### Scenario: 原始素材后续变化

- **WHEN** the selected JD or resume is edited after the interview starts
- **THEN** the active session SHALL retain the original snapshot content
- **AND** a future session MAY use the updated source record

