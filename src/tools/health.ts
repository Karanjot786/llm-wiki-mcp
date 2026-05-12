import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { WikiCache } from '../cache.js';
import type { LintIssue, WikiStats, PageType } from '../types.js';
import { parsePage } from './page.js';
import { formatError } from '../errors.js';
import { WIKI_SPECIAL_FILES } from '../constants.js';

export function computeHealthScore(issues: LintIssue[], totalPages: number): number {
  if (totalPages === 0) return 100;
  const errorPenalty = issues.filter(i => i.severity === 'error').length * 10;
  const warnPenalty = issues.filter(i => i.severity === 'warning').length * 3;
  return Math.max(0, 100 - errorPenalty - warnPenalty);
}

export function registerHealthTools(server: McpServer, gh: GitHubClient, cache: WikiCache): void {

  server.registerTool(
    'wiki_lint',
    {
      title: 'Lint Wiki',
      description: `Run health checks across all cached wiki pages and return issues with improvement suggestions. Reads from GitHub to verify source citations and link counts.

Checks performed:
  - Pages with no source citations (rule: needs-citation)
  - Orphan pages with no inbound links (rule: no-inbound-links, excludes synthesis pages)
  - Pages marked needs_sources in status (rule: needs-sources-status)
  - Unresolved contradictions in contradictions.md (rule: unresolved-contradictions)
  - Pages with < 100 words in body (rule: shallow-content)
  - Concept/entity/topic pages with no outbound links (rule: no-outbound-links)

Returns:
  {
    "health_score": number,   // 0-100 score (errors -10pts each, warnings -3pts each)
    "total_pages": number,    // Total pages checked
    "issue_count": number,    // Total issues found
    "issues": [
      {
        "rule": string,     // Rule name e.g. "needs-citation"
        "severity": string, // "error" or "warning"
        "path": string,     // Affected page path
        "message": string   // Human-readable description
      }
    ],
    "summary": string         // One-line summary of wiki health
  }

Examples:
  - Use when: "How healthy is my wiki?" → call with no args
  - Use when: "Find pages that need more sources" → look for issues with rule="needs-citation"
  - Don't use when: You just want page counts (use wiki_get_stats instead — much faster)

Error Handling:
  - Health score is based only on issues found; 100 means no issues detected
  - Unreadable GitHub pages are silently skipped (network errors don't fail the check)`,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        health_score: z.number(),
        total_pages: z.number(),
        issue_count: z.number(),
        issues: z.array(z.object({ rule: z.string(), severity: z.string(), path: z.string(), message: z.string() })),
        summary: z.string(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const allPages = cache.listAll();
        const issues: LintIssue[] = [];

        for (const page of allPages) {
          // Check for pages with no sources (only non-source-type pages)
          if (page.type !== 'source') {
            // Re-fetch frontmatter to get real sources field
            try {
              const { content: raw } = await gh.readFile(page.path);
              const { frontmatter } = parsePage(raw);
              if (frontmatter.sources.length === 0) {
                issues.push({
                  rule: 'needs-citation',
                  severity: 'warning',
                  path: page.path,
                  message: `Page "${page.title}" has no source citations`,
                });
              }
              if (frontmatter.inbound_links_count === 0 && page.type !== 'synthesis') {
                issues.push({
                  rule: 'no-inbound-links',
                  severity: 'warning',
                  path: page.path,
                  message: `Page "${page.title}" has no inbound links (orphan)`,
                });
              }
            } catch { /* skip unreadable pages */ }

            if (page.status === 'needs_sources') {
              issues.push({
                rule: 'needs-sources-status',
                severity: 'warning',
                path: page.path,
                message: `Page "${page.title}" is marked as needing more sources`,
              });
            }
          }
        }

        // Check contradictions file
        try {
          const { content } = await gh.readFile(WIKI_SPECIAL_FILES.contradictions);
          const unresolvedCount = (content.match(/status: unresolved/gi) || []).length;
          if (unresolvedCount > 0) {
            issues.push({
              rule: 'unresolved-contradictions',
              severity: 'error',
              path: WIKI_SPECIAL_FILES.contradictions,
              message: `${unresolvedCount} unresolved contradiction(s) need attention`,
            });
          }
        } catch { /* no contradictions file yet — fine */ }

        // Rule: shallow-content — pages with < 100 words in body
        for (const page of allPages) {
          const body = page.content.replace(/^---[\s\S]*?---\n?/, '');
          const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
          if (wordCount > 0 && wordCount < 100) {
            issues.push({
              rule: 'shallow-content',
              severity: 'warning',
              path: page.path,
              message: `Page "${page.title}" has only ${wordCount} words. Consider expanding.`,
            });
          }
        }

        // Rule: no-outbound-links — concept/entity/topic pages with no [[links]] at all
        // Regex handles [[Name]] and [[Name|Display Text]] wikilink syntax
        const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;
        const mdLinkRe = /\]\(pages\//;
        const linkableTypes: PageType[] = ['concept', 'entity', 'topic'];
        for (const page of allPages) {
          if (!linkableTypes.includes(page.type as PageType)) continue;
          if (!wikilinkRe.test(page.content) && !mdLinkRe.test(page.content)) {
            issues.push({
              rule: 'no-outbound-links',
              severity: 'warning',
              path: page.path,
              message: `Page "${page.title}" has no links to other wiki pages. Add [[PageName]] links to connect it.`,
            });
          }
        }

        const healthScore = computeHealthScore(issues, allPages.length);
        const summary = issues.length === 0
          ? `Wiki is healthy! ${allPages.length} pages, no issues.`
          : `${issues.length} issue(s) found across ${allPages.length} pages. Health score: ${healthScore}/100`;

        const output = { health_score: healthScore, total_pages: allPages.length, issue_count: issues.length, issues, summary };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_get_stats',
    {
      title: 'Get Wiki Stats',
      description: `Get overview statistics for the entire wiki from the local cache. Fast — no GitHub calls needed for basic counts.

Returns:
  {
    "total_pages": number,              // All non-deleted pages
    "by_type": { [type]: number },      // Count per page type
    "total_sources": number,            // Number of ingested sources
    "unresolved_contradictions": number,// Count from contradictions.md
    "health_score": number,             // Approximate score (100 = no detected issues)
    "top_linked": [
      {
        "path": string,         // Page path
        "title": string,        // Page title
        "inbound_links": number // Pages linking to this one
      }
    ]
  }

Examples:
  - Use when: "How many pages does my wiki have?" → call with no args, read total_pages
  - Use when: "Give me a wiki overview" → call with no args, show by_type breakdown
  - Don't use when: You need detailed issue reports (use wiki_lint instead)

Error Handling:
  - unresolved_contradictions reads contradictions.md; returns 0 if file doesn't exist yet
  - top_linked reads frontmatter from up to 20 pages; slower on large wikis`,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        total_pages: z.number(),
        by_type: z.record(z.number()),
        total_sources: z.number(),
        unresolved_contradictions: z.number(),
        health_score: z.number(),
        top_linked: z.array(z.object({ path: z.string(), title: z.string(), inbound_links: z.number() })),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const byType = cache.countByType();
        const allPages = cache.listAll();
        const total = allPages.length;
        const sources = byType['source'] ?? 0;

        let unresolvedContradictions = 0;
        try {
          const { content: contContent } = await gh.readFile(WIKI_SPECIAL_FILES.contradictions);
          unresolvedContradictions = (contContent.match(/\*\*Status:\*\* unresolved/gi) || []).length;
        } catch { /* no contradictions file yet */ }

        // Read inbound_links_count from frontmatter for top candidates
        const candidates = allPages.filter(p => p.type !== 'source').slice(0, 20);
        const topLinkedRaw: Array<{ path: string; title: string; inbound_links: number }> = [];
        for (const p of candidates) {
          try {
            const { content: raw } = await gh.readFile(p.path);
            const { frontmatter } = parsePage(raw);
            topLinkedRaw.push({ path: p.path, title: p.title, inbound_links: frontmatter.inbound_links_count });
          } catch {
            topLinkedRaw.push({ path: p.path, title: p.title, inbound_links: 0 });
          }
        }
        const topLinked = topLinkedRaw
          .sort((a, b) => b.inbound_links - a.inbound_links)
          .slice(0, 5);

        const stats: WikiStats = {
          total_pages: total,
          by_type: byType as Record<PageType, number>,
          total_sources: sources,
          unresolved_contradictions: unresolvedContradictions,
          health_score: computeHealthScore([], total),
          top_linked: topLinked,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(stats) }], structuredContent: stats as unknown as Record<string, unknown> };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
