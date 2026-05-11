# LLM Wiki MCP Server

MCP server implementing [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Instead of RAG (re-derive knowledge every query), an LLM incrementally **compiles** sources into a persistent, interlinked wiki stored in a GitHub repo. The MCP handles storage and search; Claude handles knowledge synthesis.

## Setup

### Prerequisites
- Node.js 18+
- `gh` CLI authenticated (`gh auth login`)
- A GitHub repo for your wiki (create via `gh repo create my-wiki --private`)

### Install

```bash
npm install
npm run build
```

### Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-wiki": {
      "command": "node",
      "args": ["/Users/ksd/Desktop/mcp/llm-wiki-mcp/dist/index.js"],
      "env": {
        "WIKI_GITHUB_OWNER": "your-github-username",
        "WIKI_GITHUB_REPO": "my-wiki"
      }
    }
  }
}
```

## Tools (17)

| Tool | Description |
|---|---|
| `wiki_create_page` | Create entity/concept/topic/synthesis page |
| `wiki_update_page` | Update existing page content |
| `wiki_get_page` | Read page by path |
| `wiki_list_pages` | List pages with type/tag filter |
| `wiki_delete_page` | Soft-delete page |
| `wiki_add_source` | Fetch URL or text, store source page, return content for Claude |
| `wiki_list_sources` | List ingested sources |
| `wiki_get_source` | Read source summary page |
| `wiki_search` | BM25 full-text search |
| `wiki_sync_cache` | Refresh local search cache from GitHub |
| `wiki_append_log` | Write to activity log |
| `wiki_get_log` | Read recent log entries |
| `wiki_lint` | Health check (orphans, missing citations) |
| `wiki_get_stats` | Page counts by type, health score |
| `wiki_flag_contradiction` | Record conflicting claims |
| `wiki_list_contradictions` | List unresolved contradictions |
| `wiki_resolve_contradiction` | Mark contradiction resolved |

## Example Workflow

```
User: "Add this article to my wiki: https://arxiv.org/abs/1706.03762"

Claude calls:
1. wiki_add_source(type="url", url="https://arxiv.org/abs/1706.03762")
2. [reads returned content]
3. wiki_create_page(type="concept", title="Transformer Architecture", ...)
4. wiki_create_page(type="entity", title="Ashish Vaswani", ...)
5. wiki_update_page(path="pages/topics/nlp.md", ...)
6. wiki_append_log(operation="ingest", description="Added Attention Is All You Need paper")
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WIKI_GITHUB_OWNER` | Yes | — | GitHub username or org |
| `WIKI_GITHUB_REPO` | Yes | — | Repository name |
| `WIKI_CACHE_PATH` | No | `~/.wiki-mcp/cache.db` | SQLite cache path |
