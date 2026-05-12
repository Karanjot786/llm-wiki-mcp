# llm-wiki-mcp

Build a personal wiki with your LLM. Based on [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): your LLM reads sources and writes structured pages to a GitHub repo. You ask questions; it searches and synthesizes. No RAG pipeline, no vector database. The knowledge builds up as plain markdown files you own.

## Prerequisites

- Node.js 18+
- `gh` CLI authenticated (`gh auth login`)
- A GitHub repo for your wiki: `gh repo create my-wiki --private`

## Installation

This config works in most clients. Add it to your MCP config file:

```json
{
  "mcpServers": {
    "llm-wiki": {
      "command": "npx",
      "args": ["-y", "llm-wiki-mcp"],
      "env": {
        "WIKI_GITHUB_OWNER": "your-github-username",
        "WIKI_GITHUB_REPO": "my-wiki"
      }
    }
  }
}
```

Prefer a setup wizard? Run this and pick your client:

```bash
npx -y llm-wiki-mcp install
```

```
  1. Claude Desktop        6. Zed
  2. Claude Code CLI       7. Continue.dev
  3. Cursor                8. Cline
  4. Windsurf              9. Roo Code
  5. VS Code / Copilot     0. All clients
```

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp/install%3F%257B%2522name%2522%253A%2522llm-wiki%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522llm-wiki-mcp%2522%255D%252C%2522env%2522%253A%257B%2522WIKI_GITHUB_OWNER%2522%253A%2522%2524%257Binput%253Agithub_owner%257D%2522%252C%2522WIKI_GITHUB_REPO%2522%253A%2522%2524%257Binput%253Agithub_repo%257D%2522%257D%252C%2522inputs%2522%253A%255B%257B%2522type%2522%253A%2522promptString%2522%252C%2522id%2522%253A%2522github_owner%2522%252C%2522description%2522%253A%2522GitHub%2520username%2520or%2520org%2522%257D%252C%257B%2522type%2522%253A%2522promptString%2522%252C%2522id%2522%253A%2522github_repo%2522%252C%2522description%2522%253A%2522GitHub%2520repo%2520name%2520for%2520your%2520wiki%2522%257D%255D%257D) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=llm-wiki-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImxsbS13aWtpLW1jcCJdfQ)

---

<details>
<summary>Claude Code</summary>

```bash
claude mcp add --scope user llm-wiki \
  -e WIKI_GITHUB_OWNER=your-username \
  -e WIKI_GITHUB_REPO=my-wiki \
  -- npx -y llm-wiki-mcp
```

Verify: `claude mcp list`

</details>

<details>
<summary>Claude Desktop</summary>

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`  
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the standard config above. Restart Claude Desktop after saving.

</details>

<details>
<summary>Cursor</summary>

Click the Install in Cursor badge above, then add your env vars in Settings > MCP > llm-wiki-mcp > Edit.

Or create `~/.cursor/mcp.json` manually:

```json
{
  "mcpServers": {
    "llm-wiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "llm-wiki-mcp"],
      "env": {
        "WIKI_GITHUB_OWNER": "your-github-username",
        "WIKI_GITHUB_REPO": "my-wiki"
      }
    }
  }
}
```

> Cursor requires `"type": "stdio"`. Omitting it silently disables the server.

Use via Agent mode (Cmd+I, then Agent).

</details>

<details>
<summary>Windsurf</summary>

`~/.codeium/windsurf/mcp_config.json`

> Windsurf uses `"servers"` as the root key, not `"mcpServers"`.

```json
{
  "servers": {
    "llm-wiki": {
      "command": "npx",
      "args": ["-y", "llm-wiki-mcp"],
      "env": {
        "WIKI_GITHUB_OWNER": "your-github-username",
        "WIKI_GITHUB_REPO": "my-wiki"
      }
    }
  }
}
```

Restart Windsurf. Tools appear in the Cascade panel.

</details>

<details>
<summary>VS Code / GitHub Copilot</summary>

Click the Install in VS Code badge above. It prompts for your GitHub owner and repo, then writes the config.

Or create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "llm-wiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "llm-wiki-mcp"],
      "env": {
        "WIKI_GITHUB_OWNER": "your-github-username",
        "WIKI_GITHUB_REPO": "my-wiki"
      }
    }
  }
}
```

Requires the GitHub Copilot extension with Agent mode enabled (`github.copilot.chat.agent.enabled: true`).

</details>

<details>
<summary>Zed</summary>

`~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "llm-wiki": {
      "command": {
        "path": "npx",
        "args": ["-y", "llm-wiki-mcp"],
        "env": {
          "WIKI_GITHUB_OWNER": "your-github-username",
          "WIKI_GITHUB_REPO": "my-wiki"
        }
      }
    }
  }
}
```

</details>

<details>
<summary>Continue.dev</summary>

Create `~/.continue/mcpServers/llm-wiki.yaml`:

```yaml
name: llm-wiki
command: npx
args:
  - "-y"
  - llm-wiki-mcp
env:
  WIKI_GITHUB_OWNER: your-github-username
  WIKI_GITHUB_REPO: my-wiki
```

</details>

<details>
<summary>Cline</summary>

Edit via Cline > MCP Servers > Edit Config, or open the file directly:

macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`  
Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

Add the standard config above.

</details>

<details>
<summary>Roo Code</summary>

macOS: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

Add the standard config above.

</details>

<details>
<summary>Codex (OpenAI)</summary>

```bash
codex mcp add llm-wiki npx "-y llm-wiki-mcp"
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.llm-wiki]
command = "npx"
args = ["-y", "llm-wiki-mcp"]

[mcp_servers.llm-wiki.env]
WIKI_GITHUB_OWNER = "your-github-username"
WIKI_GITHUB_REPO = "my-wiki"
```

</details>

<details>
<summary>MCP Inspector (testing)</summary>

```bash
WIKI_GITHUB_OWNER=your-username WIKI_GITHUB_REPO=my-wiki \
  npx @modelcontextprotocol/inspector npx -y llm-wiki-mcp
```

Open the printed URL. All 17 tools appear under the Tools tab.

</details>

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `WIKI_GITHUB_OWNER` | Yes | | GitHub username or org |
| `WIKI_GITHUB_REPO` | Yes | | Repository name |
| `WIKI_CACHE_PATH` | No | `~/.wiki-mcp/cache.db` | SQLite cache path |

---

## Tools (17)

| Tool | Description |
|---|---|
| `wiki_create_page` | Create entity, concept, topic, or synthesis page |
| `wiki_update_page` | Update existing page content |
| `wiki_get_page` | Read page by path |
| `wiki_list_pages` | List pages with type or tag filter |
| `wiki_delete_page` | Soft-delete page |
| `wiki_add_source` | Fetch URL or text, store source page, return content for LLM |
| `wiki_list_sources` | List ingested sources |
| `wiki_get_source` | Read source summary page |
| `wiki_search` | BM25 full-text search |
| `wiki_sync_cache` | Refresh local search cache from GitHub |
| `wiki_append_log` | Write to activity log |
| `wiki_get_log` | Read recent log entries |
| `wiki_lint` | Health check for orphans and missing citations |
| `wiki_get_stats` | Page counts by type, health score |
| `wiki_flag_contradiction` | Record conflicting claims |
| `wiki_list_contradictions` | List unresolved contradictions |
| `wiki_resolve_contradiction` | Mark contradiction resolved |

## Example workflow

```
User: "Add this article to my wiki: https://arxiv.org/abs/1706.03762"

LLM calls:
1. wiki_add_source(type="url", url="https://arxiv.org/abs/1706.03762")
2. [reads returned content]
3. wiki_create_page(type="concept", title="Transformer Architecture", ...)
4. wiki_create_page(type="entity", title="Ashish Vaswani", ...)
5. wiki_update_page(path="pages/topics/nlp.md", ...)
6. wiki_append_log(operation="ingest", description="Added Attention Is All You Need paper")
```

## Publishing

```bash
npm login
npm publish
```

After publishing, users install with `npx -y llm-wiki-mcp install`. No clone needed.
