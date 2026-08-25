# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, including its labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with the relevant label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` resolves it automatically when run inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Pull requests are reviewed as code changes, not treated as incoming feature requests by the triage workflow.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When a skill says to fetch a ticket, run `gh issue view <number> --comments`.
