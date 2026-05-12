# Contributing

## Prerequisites

- Node.js 18+
- `gh` CLI authenticated (`gh auth login`)
- A GitHub repo for testing: `gh repo create my-test-wiki --private`

## Setup

```bash
git clone https://github.com/karanjot786/wiki-hub-mcp.git
cd wiki-hub-mcp
npm install
```

## Development

```bash
npm run dev          # tsx watch — hot reload
npm run build        # compile TypeScript to dist/
npm test             # vitest run
npm run type-check   # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write src
```

## Testing with MCP Inspector

```bash
WIKI_GITHUB_OWNER=your-username WIKI_GITHUB_REPO=my-test-wiki \
  npx @modelcontextprotocol/inspector node dist/index.js
```

## Project structure

```
src/
  index.ts        entry point, server startup, wiki init
  github.ts       gh CLI wrapper (readFile, writeFile, listFiles)
  cache.ts        SQLite FTS5 search cache
  types.ts        shared interfaces
  installer.ts    interactive setup wizard
  constants.ts    WIKI_SCHEMA_TEMPLATE, page templates
  tools/
    page.ts       wiki_create_page, wiki_update_page, ...
    source.ts     wiki_add_source, wiki_list_sources, ...
    search.ts     wiki_search, wiki_sync_cache
    log.ts        wiki_append_log, wiki_get_log
    health.ts     wiki_lint, wiki_get_stats
    analysis.ts   wiki_flag_contradiction, ...
```

## Commit conventions

```
feat: add new tool
fix: correct SHA conflict on concurrent writes
docs: update README installation section
chore: bump dependency versions
test: add search tool tests
```

## Pull requests

- One feature or fix per PR
- Tests required for new tools
- `npm run build && npm test` must pass
