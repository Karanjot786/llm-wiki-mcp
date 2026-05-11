import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { WikiCache } from '../cache.js';
import { parsePage } from './page.js';
import { formatError } from '../errors.js';
import { WIKI_DIRS } from '../constants.js';

async function syncAllPages(gh: GitHubClient, cache: WikiCache): Promise<number> {
  const dirs = Object.values(WIKI_DIRS);
  let count = 0;
  for (const dir of dirs) {
    const files = await gh.listFiles(dir);
    for (const file of files) {
      if (!file.name.endsWith('.md') || file.type !== 'file') continue;
      try {
        const { content: raw, sha } = await gh.readFile(file.path);
        const { frontmatter, content } = parsePage(raw);
        cache.upsert({ path: file.path, sha, frontmatter, content, raw });
        count++;
      } catch {
        // skip unparseable files
      }
    }
  }
  return count;
}

export function registerSearchTools(server: McpServer, gh: GitHubClient, cache: WikiCache): void {

  server.registerTool(
    'wiki_search',
    {
      title: 'Search Wiki',
      description: `Full-text BM25 search across all wiki pages using local SQLite FTS5 cache.

If the cache is empty, automatically syncs from GitHub first (may take a moment on large wikis).

Args:
  - query: Search query (keywords or phrase)
  - type: Filter results by page type (optional)
  - limit: Max results to return (default 10)

Returns: Array of { path, title, type, excerpt, rank } ordered by relevance.`,
      inputSchema: z.object({
        query: z.string().min(1).max(500).describe('Search query'),
        type: z.enum(['entity', 'concept', 'topic', 'source', 'comparison', 'synthesis']).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }).strict(),
      outputSchema: z.object({
        query: z.string(),
        count: z.number(),
        results: z.array(z.object({ path: z.string(), title: z.string(), type: z.string(), excerpt: z.string(), rank: z.number() })),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, type, limit }) => {
      try {
        // Auto-sync if cache is empty
        const all = cache.listAll();
        if (all.length === 0) {
          await syncAllPages(gh, cache);
        }

        let results = cache.search(query, limit * 2); // over-fetch for filtering
        if (type) results = results.filter(r => r.type === type);
        results = results.slice(0, limit);

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No results found for "${query}". Try different keywords or call wiki_sync_cache to refresh.` }],
            structuredContent: { query, count: 0, results: [] },
          };
        }
        const output = { query, count: results.length, results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_sync_cache',
    {
      title: 'Sync Wiki Cache',
      description: `Sync the local SQLite search cache from the GitHub repo. Run this after bulk updates or when search results seem stale.

Returns: { pages_synced, message }`,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ pages_synced: z.number(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const count = await syncAllPages(gh, cache);
        const output = { pages_synced: count, message: `Cache synced: ${count} pages indexed` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
