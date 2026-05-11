import matter from 'gray-matter';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { WikiCache } from '../cache.js';
import type { WikiPage, WikiPageFrontmatter, PageType, PageStatus } from '../types.js';
import { WIKI_DIRS } from '../constants.js';
import { formatError } from '../errors.js';

// ── Helpers (exported for testing) ──────────────────────────────────────────

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function buildPageContent(fm: WikiPageFrontmatter, body: string): string {
  return matter.stringify(body, fm as unknown as Record<string, unknown>);
}

export function parsePage(raw: string): { frontmatter: WikiPageFrontmatter; content: string } {
  const parsed = matter(raw);
  const fm = parsed.data as WikiPageFrontmatter;
  return { frontmatter: fm, content: parsed.content };
}

function pageDir(type: PageType): string {
  return WIKI_DIRS[type === 'entity' ? 'entities' :
    type === 'concept' ? 'concepts' :
    type === 'topic' ? 'topics' :
    type === 'source' ? 'sources' :
    type === 'comparison' ? 'comparisons' : 'synthesis'];
}

function now(): string {
  return new Date().toISOString();
}

// ── Tool Registration ─────────────────────────────────────────────────────────

export function registerPageTools(server: McpServer, gh: GitHubClient, cache: WikiCache): void {

  // wiki_create_page
  server.registerTool(
    'wiki_create_page',
    {
      title: 'Create Wiki Page',
      description: `Create a new markdown page in the wiki GitHub repo.

The page is stored at pages/{type}s/{slug}.md with YAML frontmatter auto-generated from the inputs. The slug is derived from the title (lowercase, hyphens). Use after ingesting a source to record entities, concepts, topics, or synthesis pages.

Args:
  - type ("entity"|"concept"|"topic"|"source"|"comparison"|"synthesis"): Page category
  - title (string): Human-readable page title (becomes the filename slug)
  - content (string): Full markdown body — do NOT include frontmatter, it is generated
  - tags (string[]): Topic tags for search and filtering
  - sources (string[]): Source page paths that informed this page (e.g. "pages/sources/my-paper-2026.md")
  - related_pages (string[]): Paths to other pages this page links to
  - status ("draft"|"complete"|"needs_sources"): Completion status (default: draft)

Returns:
  {
    "path": string,    // Full path in repo e.g. "pages/concepts/transformer-architecture.md"
    "sha": string,     // GitHub blob SHA
    "message": string  // Confirmation message
  }

Examples:
  - Use when: "Create a concept page for Transformer Architecture" → type="concept", title="Transformer Architecture", content="..."
  - Use when: "Add Andrej Karpathy as an entity" → type="entity", title="Andrej Karpathy", content="..."
  - Don't use when: The page already exists (use wiki_update_page instead)

Error Handling:
  - Returns "Error: GitHub auth failed. Run: gh auth login" if not authenticated
  - Returns "Error: Conflict writing ... — SHA mismatch, retry" on concurrent write conflict`,
      inputSchema: z.object({
        type: z.enum(['entity', 'concept', 'topic', 'source', 'comparison', 'synthesis'])
          .describe('Page category'),
        title: z.string().min(1).max(200).describe('Page title'),
        content: z.string().min(1).describe('Markdown body (no frontmatter)'),
        tags: z.array(z.string()).default([]).describe('Topic tags'),
        sources: z.array(z.string()).default([]).describe('Source page paths'),
        related_pages: z.array(z.string()).default([]).describe('Related page paths'),
        status: z.enum(['draft', 'complete', 'needs_sources']).default('draft').describe('Completion status'),
      }).strict(),
      outputSchema: z.object({ path: z.string(), sha: z.string(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ type, title, content, tags, sources, related_pages, status }) => {
      try {
        const slug = slugify(title);
        const path = `${pageDir(type as PageType)}/${slug}.md`;
        const ts = now();
        const fm: WikiPageFrontmatter = {
          title, type: type as PageType, created: ts, updated: ts,
          sources, tags, status: status as PageStatus, related_pages,
          inbound_links_count: 0, outbound_links_count: 0,
        };
        const raw = buildPageContent(fm, content);
        const sha = await gh.writeFile(path, raw, `wiki: create ${type} page "${title}"`);
        const page: WikiPage = { path, sha, frontmatter: fm, content, raw };
        cache.upsert(page);
        const output = { path, sha, message: `Created ${path}` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  // wiki_update_page
  server.registerTool(
    'wiki_update_page',
    {
      title: 'Update Wiki Page',
      description: `Update an existing wiki page's content and/or frontmatter fields.

Automatically fetches the current SHA before writing — no need to track SHAs manually.

Args:
  - path: Full page path e.g. "pages/concepts/machine-learning.md"
  - content: New full markdown body (replaces existing body)
  - tags: Replace tags array (optional — omit to keep existing)
  - sources: Replace sources array (optional — omit to keep existing)
  - related_pages: Replace related_pages array (optional — omit to keep existing)
  - status: Update status (optional — omit to keep existing)

Returns: { path, sha, message } on success.`,
      inputSchema: z.object({
        path: z.string().regex(/^[a-zA-Z0-9_./-]+$/, 'Invalid path characters').refine(p => !p.includes('..'), 'Path traversal not allowed').describe('Full page path e.g. "pages/concepts/machine-learning.md"'),
        content: z.string().min(1).describe('New markdown body'),
        tags: z.array(z.string()).optional(),
        sources: z.array(z.string()).optional(),
        related_pages: z.array(z.string()).optional(),
        status: z.enum(['draft', 'complete', 'needs_sources', 'deleted']).optional(),
      }).strict(),
      outputSchema: z.object({ path: z.string(), sha: z.string(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, content, tags, sources, related_pages, status }) => {
      try {
        const { content: existingRaw, sha: existingSha } = await gh.readFile(path);
        const { frontmatter: existing } = parsePage(existingRaw);
        const fm: WikiPageFrontmatter = {
          ...existing,
          updated: now(),
          ...(tags !== undefined && { tags }),
          ...(sources !== undefined && { sources }),
          ...(related_pages !== undefined && { related_pages }),
          ...(status !== undefined && { status: status as PageStatus }),
        };
        const raw = buildPageContent(fm, content);
        const newSha = await gh.writeFile(path, raw, `wiki: update "${fm.title}"`, existingSha);
        const page: WikiPage = { path, sha: newSha, frontmatter: fm, content, raw };
        cache.upsert(page);
        const output = { path, sha: newSha, message: `Updated ${path}` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  // wiki_get_page
  server.registerTool(
    'wiki_get_page',
    {
      title: 'Get Wiki Page',
      description: `Read a wiki page by path. Returns full markdown content plus parsed frontmatter.

Args:
  - path: Full page path e.g. "pages/concepts/machine-learning.md"

Returns: { path, frontmatter, content, sha }`,
      inputSchema: z.object({
        path: z.string().regex(/^[a-zA-Z0-9_./-]+$/, 'Invalid path characters').refine(p => !p.includes('..'), 'Path traversal not allowed').describe('Full page path'),
      }).strict(),
      outputSchema: z.object({
        path: z.string(),
        sha: z.string(),
        frontmatter: z.record(z.unknown()),
        content: z.string(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      try {
        const { content: raw, sha } = await gh.readFile(path);
        const { frontmatter, content } = parsePage(raw);
        const output = { path, sha, frontmatter: frontmatter as unknown as Record<string, unknown>, content };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  // wiki_list_pages
  server.registerTool(
    'wiki_list_pages',
    {
      title: 'List Wiki Pages',
      description: `List wiki pages from the local cache. Supports filtering by type and tag.

Args:
  - type: Filter by page type (optional)
  - tag: Filter by tag string (optional, exact match)
  - limit: Max results (default 50)

Returns: Array of { path, title, type, status, updated, tags }`,
      inputSchema: z.object({
        type: z.enum(['entity', 'concept', 'topic', 'source', 'comparison', 'synthesis']).optional(),
        tag: z.string().optional().describe('Filter pages containing this tag'),
        limit: z.number().int().min(1).max(200).default(50),
      }).strict(),
      outputSchema: z.object({
        count: z.number(),
        pages: z.array(z.object({
          path: z.string(), title: z.string(), type: z.string(),
          status: z.string(), updated: z.string(), tags: z.array(z.string()),
        })),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ type, tag, limit }) => {
      try {
        let rows = type ? cache.listByType(type as PageType) : cache.listAll();
        if (tag) rows = rows.filter(r => (JSON.parse(r.tags as string) as string[]).includes(tag));
        rows = rows.slice(0, limit);
        const result = rows.map(r => ({
          path: r.path, title: r.title, type: r.type,
          status: r.status, updated: r.updated, tags: JSON.parse(r.tags as string),
        }));
        const output = { count: result.length, pages: result };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  // wiki_delete_page
  server.registerTool(
    'wiki_delete_page',
    {
      title: 'Delete Wiki Page (soft)',
      description: `Soft-delete a wiki page by setting status to "deleted". Page remains in GitHub for history.

Args:
  - path: Full page path to delete
  - reason: Why this page is being deleted (logged)

Returns: { path, message } on success.`,
      inputSchema: z.object({
        path: z.string().regex(/^[a-zA-Z0-9_./-]+$/, 'Invalid path characters').refine(p => !p.includes('..'), 'Path traversal not allowed').describe('Full page path to delete'),
        reason: z.string().describe('Reason for deletion'),
      }).strict(),
      outputSchema: z.object({ path: z.string(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, reason }) => {
      try {
        const { content: raw, sha } = await gh.readFile(path);
        const { frontmatter, content } = parsePage(raw);
        const fm: WikiPageFrontmatter = { ...frontmatter, status: 'deleted', updated: now() };
        const newRaw = buildPageContent(fm, content);
        await gh.writeFile(path, newRaw, `wiki: delete "${frontmatter.title}" — ${reason}`, sha);
        cache.remove(path);
        const output = { path, message: `Soft-deleted ${path}` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
