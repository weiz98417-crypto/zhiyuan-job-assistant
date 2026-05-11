## ADDED Requirements

### Requirement: Fetch JD content from URL
The system SHALL accept a job posting URL and return cleaned, readable JD text content extracted from the target page.

#### Scenario: Successful fetch from Boss直聘
- **WHEN** user submits a valid Boss直聘 job URL
- **THEN** system returns `{ success: true, data: { url, title, text, source: "zhipin.com", fetchedAt } }` where text contains the job title, responsibilities, and requirements

#### Scenario: Invalid or unreachable URL
- **WHEN** user submits a URL that returns 404 or times out after 10 seconds
- **THEN** system returns `{ success: false, error: "无法访问该链接" }` with HTTP 502

#### Scenario: Non-JD page
- **WHEN** URL returns HTML with no detectable JD content (less than 200 chars of body text)
- **THEN** system returns `{ success: false, error: "未检测到职位描述内容，请确认链接有效或改用文本粘贴" }` with HTTP 422

### Requirement: Platform detection
The system SHALL detect common job platforms from the URL hostname and apply platform-specific extraction rules where applicable.

#### Scenario: Detect zhipin.com
- **WHEN** URL hostname matches `zhipin.com`
- **THEN** source field is `"zhipin.com"` and extraction targets `.job-sec`, `.detail-content`, or body text

#### Scenario: Detect greenhouse.io
- **WHEN** URL hostname matches `greenhouse.io`
- **THEN** source field is `"greenhouse"` and extraction targets `#content` or body text

### Requirement: HTML sanitization
The system SHALL strip all script, style, and navigation elements from fetched HTML and return only the main textual content.

#### Scenario: Script and style removal
- **WHEN** page HTML contains `<script>`, `<style>`, and `<nav>` elements
- **THEN** returned text excludes all script, style, and navigation content

### Requirement: Size and timeout limits
The system SHALL enforce a 10-second fetch timeout and 500KB maximum response size.

#### Scenario: Timeout
- **WHEN** fetch takes longer than 10 seconds
- **THEN** system aborts and returns `{ success: false, error: "请求超时" }` with HTTP 408

#### Scenario: Oversized response
- **WHEN** response body exceeds 500KB
- **THEN** system truncates and processes only the first 500KB
