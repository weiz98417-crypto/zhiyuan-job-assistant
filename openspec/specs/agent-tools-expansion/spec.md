## ADDED Requirements

### Requirement: MCP Manager SHALL connect to configured MCP servers

The system SHALL provide an MCPManager that connects to configured MCP servers, discovers their tools, and makes them available through a unified HTTP proxy endpoint.

#### Scenario: Server startup with MCP initialization
- **WHEN** the Next.js server starts and the first MCP tool call is made
- **THEN** MCPManager SHALL lazily initialize connections to all configured MCP servers and discover their tools

#### Scenario: MCP tool discovery
- **WHEN** MCPManager connects to a configured MCP server (e.g., SerpAPI, Baidu Map, mcp-jobs)
- **THEN** it SHALL call `listTools()` on the MCP server and register all discovered tools into the agent tool registry with their original names, descriptions, and parameter schemas

#### Scenario: MCP server connection failure
- **WHEN** an MCP server fails to connect or times out
- **THEN** MCPManager SHALL log the failure and continue without that server's tools, without blocking other MCP servers or the application

### Requirement: MCP tools SHALL be callable via HTTP proxy

The system SHALL provide `POST /api/agent/mcp/call` that accepts `{ server, tool, params }` and returns the MCP tool's execution result. This endpoint SHALL proxy tool calls from the browser to server-side MCP clients.

#### Scenario: Successful MCP tool call
- **WHEN** the agent calls an MCP-provided tool (e.g., `serpapi_google_search`)
- **THEN** the client-side `executeTool()` SHALL POST to `/api/agent/mcp/call` and return the structured result

#### Scenario: MCP tool call with invalid params
- **WHEN** the MCP tool call receives invalid parameters
- **THEN** the proxy SHALL return `{ success: false, error: "<error message>" }` without crashing

#### Scenario: MCP server not configured
- **WHEN** a tool call targets a server that is not present in the MCP config
- **THEN** the proxy SHALL return `{ success: false, error: "MCP server not configured: <name>" }`

### Requirement: SerpAPI MCP SHALL provide web search capability

The system SHALL integrate SerpAPI MCP Server to provide multi-engine web search, replacing the need for a custom `web_search` tool.

#### Scenario: Chinese search via Baidu
- **WHEN** the agent calls a SerpAPI search tool with `engine: "baidu"` and a Chinese query
- **THEN** the system SHALL return Chinese-language search results from Baidu

#### Scenario: English search via Google
- **WHEN** the agent calls a SerpAPI search tool with `engine: "google"` and an English query
- **THEN** the system SHALL return English-language search results

### Requirement: Baidu Map MCP SHALL provide weather and location tools

The system SHALL integrate Baidu Map MCP Server to provide weather queries, location search, and route planning — all relevant to interview preparation scenarios.

#### Scenario: Weather query for interview day
- **WHEN** agent calls a Baidu Map weather tool with a Chinese city name
- **THEN** the system SHALL return current weather and forecast data

#### Scenario: Route planning to interview location
- **WHEN** agent calls a Baidu Map route planning tool with origin and destination
- **THEN** the system SHALL return route options with estimated travel time

### Requirement: mcp-jobs SHALL provide Chinese job site search

The system SHALL integrate mcp-jobs MCP Server to search Chinese recruitment platforms directly.

#### Scenario: Search Chinese job listings
- **WHEN** agent calls an mcp-jobs search tool with a role and city
- **THEN** the system SHALL return aggregated job listings from Chinese recruitment sites

#### Scenario: mcp-jobs unavailable
- **WHEN** mcp-jobs server is unreachable or returns errors
- **THEN** the agent SHALL fall back to SerpAPI web search for job listings

### Requirement: MCP config SHALL be declarative

MCP server configuration SHALL be stored in a version-controlled JSON config file, with secrets referenced from environment variables.

#### Scenario: Add a new MCP server
- **WHEN** a new MCP server entry is added to `mcp.config.json` with its npm package and environment variables
- **THEN** MCPManager SHALL automatically connect to it on next initialization and register its tools — no code changes required

#### Scenario: Missing optional API key
- **WHEN** an MCP server requires an API key that is not set in environment variables
- **THEN** MCPManager SHALL skip that server and log a warning, without affecting other configured servers
