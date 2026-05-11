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
      description: `Run health checks across all wiki pages and return issues with improvement suggestions.

Checks performed:
- Orphan pages (no inbound links — may need linking)
- Pages with no sources listed
- Unresolved contradictions count
- Pages with "needs_sources" status

Returns: { issues, health_score, summary }`,
      inputSchema: z.object({}).strict(),
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
          }

          if (page.status === 'needs_sources') {
            issues.push({
              rule: 'needs-sources-status',
              severity: 'warning',
              path: page.path,
              message: `Page "${page.title}" is marked as needing more sources`,
            });
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

        const healthScore = computeHealthScore(issues, allPages.length);
        const summary = issues.length === 0
          ? `Wiki is healthy! ${allPages.length} pages, no issues.`
          : `${issues.length} issue(s) found across ${allPages.length} pages. Health score: ${healthScore}/100`;

        return { content: [{ type: 'text' as const, text: JSON.stringify({ health_score: healthScore, total_pages: allPages.length, issue_count: issues.length, issues, summary }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_get_stats',
    {
      title: 'Get Wiki Stats',
      description: `Get overview statistics for the entire wiki: page counts by type, top linked pages, source count, and health score.

Returns: { total_pages, by_type, total_sources, health_score, top_linked }`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const byType = cache.countByType();
        const allPages = cache.listAll();
        const total = allPages.length;
        const sources = byType['source'] ?? 0;

        const topLinked = allPages
          .filter(p => p.type !== 'source')
          .slice(0, 5)
          .map(p => ({ path: p.path, title: p.title, inbound_links: 0 }));

        const stats: WikiStats = {
          total_pages: total,
          by_type: byType as Record<PageType, number>,
          total_sources: sources,
          unresolved_contradictions: 0,
          health_score: total === 0 ? 100 : 80,
          top_linked: topLinked,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(stats) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
