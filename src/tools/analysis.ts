import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { Contradiction } from '../types.js';
import { WIKI_SPECIAL_FILES } from '../constants.js';
import { formatError } from '../errors.js';

const CONT_HEADER = '# Contradictions Log\n\n';

function parseContradictions(content: string): Contradiction[] {
  const blocks = content.split(/\n(?=## CONT-)/).filter(b => b.startsWith('## CONT-'));
  return blocks.map(block => {
    const idMatch = block.match(/^## (CONT-\S+)/);
    const statusMatch = block.match(/\*\*Status:\*\* (\w+)/);
    const severityMatch = block.match(/\*\*Severity:\*\* (\w+)/);
    const pageAMatch = block.match(/\*\*Page A:\*\* `([^`]+)`/);
    const pageBMatch = block.match(/\*\*Page B:\*\* `([^`]+)`/);
    const claimAMatch = block.match(/\*\*Claim A:\*\* (.+)/);
    const claimBMatch = block.match(/\*\*Claim B:\*\* (.+)/);
    const createdMatch = block.match(/\*\*Created:\*\* (.+)/);
    const resolutionMatch = block.match(/\*\*Resolution:\*\* (.+)/);
    const resolvedAtMatch = block.match(/\*\*Resolved At:\*\* (.+)/);
    return {
      id: idMatch?.[1] ?? 'CONT-unknown',
      status: (statusMatch?.[1] ?? 'unresolved') as Contradiction['status'],
      severity: (severityMatch?.[1] ?? 'medium') as Contradiction['severity'],
      page_a: pageAMatch?.[1] ?? '',
      page_b: pageBMatch?.[1] ?? '',
      claim_a: claimAMatch?.[1]?.trim() ?? '',
      claim_b: claimBMatch?.[1]?.trim() ?? '',
      created: createdMatch?.[1]?.trim() ?? '',
      ...(resolutionMatch?.[1] && { resolution: resolutionMatch[1].trim() }),
      ...(resolvedAtMatch?.[1] && { resolved_at: resolvedAtMatch[1].trim() }),
    };
  });
}

function formatContradiction(c: Contradiction): string {
  return [
    `## ${c.id}`,
    '',
    `**Status:** ${c.status}`,
    `**Severity:** ${c.severity}`,
    `**Created:** ${c.created}`,
    '',
    `**Page A:** \`${c.page_a}\``,
    `**Claim A:** ${c.claim_a}`,
    '',
    `**Page B:** \`${c.page_b}\``,
    `**Claim B:** ${c.claim_b}`,
    ...(c.resolution ? ['', `**Resolution:** ${c.resolution}`] : []),
    ...(c.resolved_at ? [`**Resolved At:** ${c.resolved_at}`] : []),
    '',
    '---',
    '',
  ].join('\n');
}

export function registerAnalysisTools(server: McpServer, gh: GitHubClient): void {

  server.registerTool(
    'wiki_flag_contradiction',
    {
      title: 'Flag Contradiction',
      description: `Record a contradiction between two wiki pages for later human or LLM resolution. Appends a structured entry to contradictions.md in the GitHub repo.

Use this when a newly ingested source conflicts with existing wiki content. The contradiction is not automatically resolved — it is flagged for explicit review.

Args:
  - page_a (string): Path of the first wiki page
  - claim_a (string): The claim made in page_a
  - page_b (string): Path of the second page or source
  - claim_b (string): The conflicting claim in page_b
  - severity ("low"|"medium"|"high"): How urgently this needs resolution (default: medium)

Returns:
  {
    "id": string,      // Contradiction ID e.g. "CONT-001-2026"
    "message": string  // Confirmation message
  }

Examples:
  - Use when: "The new source says GPT-4 has 1T params but my concept page says 170B" → flag with both pages and claims
  - Use when: "Two entity pages contradict each other on a founding date" → flag severity="high"
  - Don't use when: You want to see existing contradictions (use wiki_list_contradictions instead)

Error Handling:
  - Returns error if contradictions.md cannot be written (auth/network issue)
  - IDs are sequential within a year (CONT-001-2026, CONT-002-2026, ...)`,
      inputSchema: z.object({
        page_a: z.string().describe('First page path'),
        claim_a: z.string().describe('Claim made in page_a'),
        page_b: z.string().describe('Second page path'),
        claim_b: z.string().describe('Conflicting claim in page_b'),
        severity: z.enum(['low', 'medium', 'high']).default('medium'),
      }).strict(),
      outputSchema: z.object({ id: z.string(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ page_a, claim_a, page_b, claim_b, severity }) => {
      try {
        let existingContent = CONT_HEADER;
        let existingSha: string | undefined;
        try {
          const existing = await gh.readFile(WIKI_SPECIAL_FILES.contradictions);
          existingContent = existing.content;
          existingSha = existing.sha;
        } catch { /* file doesn't exist yet */ }

        const existing = parseContradictions(existingContent);
        const id = `CONT-${String(existing.length + 1).padStart(3, '0')}-${new Date().getFullYear()}`;

        const contradiction: Contradiction = {
          id, page_a, claim_a, page_b, claim_b, severity,
          status: 'unresolved',
          created: new Date().toISOString(),
        };

        const newBlock = formatContradiction(contradiction);
        const updated = existingContent + newBlock;
        await gh.writeFile(WIKI_SPECIAL_FILES.contradictions, updated, `wiki: flag contradiction ${id}`, existingSha);

        const output = { id, message: `Contradiction ${id} flagged for resolution` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_list_contradictions',
    {
      title: 'List Contradictions',
      description: `List all flagged contradictions, optionally filtered by status.

Args:
  - status: Filter by status (default: unresolved)

Returns: Array of contradiction objects.`,
      inputSchema: z.object({
        status: z.enum(['unresolved', 'resolved', 'all']).default('unresolved'),
      }).strict(),
      outputSchema: z.object({
        count: z.number(),
        contradictions: z.array(z.object({
          id: z.string(), status: z.string(), severity: z.string(),
          page_a: z.string(), claim_a: z.string(), page_b: z.string(), claim_b: z.string(),
          created: z.string(),
        })),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ status }) => {
      try {
        const { content } = await gh.readFile(WIKI_SPECIAL_FILES.contradictions);
        let items = parseContradictions(content);
        if (status !== 'all') items = items.filter(c => c.status === status);
        const output = { count: items.length, contradictions: items };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch {
        const output = { count: 0, contradictions: [] };
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ...output, message: 'No contradictions recorded yet' }) }], structuredContent: output };
      }
    }
  );

  server.registerTool(
    'wiki_resolve_contradiction',
    {
      title: 'Resolve Contradiction',
      description: `Mark a contradiction as resolved with an explanation of how it was resolved.

Args:
  - id: Contradiction ID e.g. "CONT-001-2026"
  - resolution: Explanation of how the contradiction was resolved

Returns: { id, message }`,
      inputSchema: z.object({
        id: z.string().describe('Contradiction ID'),
        resolution: z.string().min(10).describe('How this was resolved'),
      }).strict(),
      outputSchema: z.object({ id: z.string(), message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, resolution }) => {
      try {
        const { content, sha } = await gh.readFile(WIKI_SPECIAL_FILES.contradictions);
        const items = parseContradictions(content);
        const target = items.find(c => c.id === id);
        if (!target) throw new Error(`Contradiction ${id} not found`);

        target.status = 'resolved';
        target.resolution = resolution;
        target.resolved_at = new Date().toISOString();

        const header = content.slice(0, content.indexOf('\n## CONT-'));
        const updated = (header || CONT_HEADER) + '\n' + items.map(formatContradiction).join('');
        await gh.writeFile(WIKI_SPECIAL_FILES.contradictions, updated, `wiki: resolve contradiction ${id}`, sha);

        const output = { id, message: `Contradiction ${id} resolved` };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );
}
