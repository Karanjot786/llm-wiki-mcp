import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { WikiCache } from '../cache.js';
import type { WikiPageFrontmatter } from '../types.js';
import { buildPageContent, slugify } from './page.js';
import { formatError } from '../errors.js';
import { CHARACTER_LIMIT } from '../constants.js';

export function generateSourceId(title: string, date: string): string {
  const slug = slugify(title).slice(0, 40);
  const year = date.slice(0, 4);
  return `${slug}-${year}`;
}

export function buildSourceFrontmatter(title: string, url: string, sourceType: string): WikiPageFrontmatter {
  const ts = new Date().toISOString();
  return {
    title, type: 'source', created: ts, updated: ts,
    sources: [url], tags: [sourceType], status: 'complete',
    related_pages: [], inbound_links_count: 0, outbound_links_count: 0,
  };
}

function validatePublicUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https:// URLs are allowed');
  }
  const host = parsed.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^0\.0\.0\.0$/,
  ];
  if (privatePatterns.some(p => p.test(host))) {
    throw new Error(`Blocked: private/internal URL not allowed`);
  }
}

async function fetchUrl(url: string): Promise<string> {
  validatePublicUrl(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'llm-wiki-mcp/1.0' },
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  });
  // Manual redirect handling — re-validate Location header
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw new Error('Redirect with no Location header');
    validatePublicUrl(location); // throws if redirect target is private
    const finalRes = await fetch(location, {
      headers: { 'User-Agent': 'llm-wiki-mcp/1.0' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual', // only follow one level
    });
    if (!finalRes.ok) throw new Error(`HTTP ${finalRes.status} fetching ${location}`);
    const text = await finalRes.text();
    return text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').slice(0, CHARACTER_LIMIT);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();
  // Strip HTML tags for readability
  return text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').slice(0, CHARACTER_LIMIT);
}

export function registerSourceTools(server: McpServer, gh: GitHubClient, cache: WikiCache): void {

  server.registerTool(
    'wiki_add_source',
    {
      title: 'Add Source to Wiki',
      description: `Fetch a URL or accept raw text as a new source, store a summary page in the wiki, and return the full content for Claude to process and integrate into existing wiki pages.

This tool handles the storage step only. After calling this tool, Claude should:
1. Read the returned content
2. Identify pages to create/update
3. Call wiki_create_page or wiki_update_page for each affected page
4. Call wiki_append_log to record the session

Args:
  - type: "url" to fetch from the web, "text" to use raw_content directly
  - url: The URL to fetch (required when type="url")
  - raw_content: Raw text/markdown (required when type="text")
  - title: Human-readable title for this source (required for type="text"; auto-derived for URLs)
  - tags: Tags to apply to the source page

Returns: { source_path, content, char_count } — content is the full fetched text for Claude to process.`,
      inputSchema: z.object({
        type: z.enum(['url', 'text']).describe('"url" to fetch, "text" to use raw_content'),
        url: z.string().url().optional().describe('URL to fetch (required if type="url")'),
        raw_content: z.string().optional().describe('Raw text (required if type="text")'),
        title: z.string().optional().describe('Title for this source'),
        tags: z.array(z.string()).default([]).describe('Tags for the source page'),
      }).strict(),
      outputSchema: z.object({
        source_path: z.string(),
        content: z.string(),
        char_count: z.number(),
        message: z.string(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ type, url, raw_content, title, tags }) => {
      try {
        let content: string;
        let resolvedTitle: string;
        let resolvedUrl: string;

        if (type === 'url') {
          if (!url) throw new Error('url is required when type="url"');
          content = await fetchUrl(url);
          resolvedUrl = url;
          resolvedTitle = title ?? url.split('/').filter(Boolean).pop() ?? url;
        } else {
          if (!raw_content) throw new Error('raw_content is required when type="text"');
          content = raw_content.slice(0, CHARACTER_LIMIT);
          resolvedUrl = 'text-input';
          resolvedTitle = title ?? `Text Source ${new Date().toLocaleDateString()}`;
        }

        const date = new Date().toISOString().slice(0, 10);
        const sourceId = generateSourceId(resolvedTitle, date);
        const sourcePath = `pages/sources/${sourceId}.md`;

        const body = `## Source\n\n- **URL:** ${resolvedUrl}\n- **Added:** ${date}\n\n## Content Preview\n\n${content.slice(0, 500)}…\n\n## Processing Notes\n\n*Add integration notes here after processing.*`;
        const fm = buildSourceFrontmatter(resolvedTitle, resolvedUrl, type);
        fm.tags = [...fm.tags, ...tags];
        const raw = buildPageContent(fm, body);

        const sha = await gh.writeFile(sourcePath, raw, `wiki: add source "${resolvedTitle}"`);
        const page = { path: sourcePath, sha, frontmatter: fm, content: body, raw };
        cache.upsert(page);

        const output = {
          source_path: sourcePath,
          content,
          char_count: content.length,
          message: `Source stored at ${sourcePath}. Process content and update wiki pages.`,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_list_sources',
    {
      title: 'List Wiki Sources',
      description: 'List all ingested sources from the local cache. Returns title, path, date added, and tags.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }).strict(),
      outputSchema: z.object({
        count: z.number(),
        sources: z.array(z.object({ path: z.string(), title: z.string(), updated: z.string(), tags: z.array(z.string()) })),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      try {
        const sources = cache.listByType('source').slice(0, limit);
        const output = { count: sources.length, sources: sources.map(s => ({ path: s.path, title: s.title, updated: s.updated, tags: JSON.parse(s.tags as string) as string[] })) };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_get_source',
    {
      title: 'Get Wiki Source',
      description: 'Read a specific source summary page by path.',
      inputSchema: z.object({
        path: z.string().regex(/^[a-zA-Z0-9_./-]+$/, 'Invalid path characters').refine(p => !p.includes('..'), 'Path traversal not allowed').describe('Source page path e.g. "pages/sources/my-article-2026.md"'),
      }).strict(),
      outputSchema: z.object({ content: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const { content: pageContent } = await gh.readFile(path);
        return { content: [{ type: 'text' as const, text: pageContent }], structuredContent: { content: pageContent } };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
