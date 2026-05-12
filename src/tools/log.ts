import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitHubClient } from '../github.js';
import type { LogEntry, LogOperation } from '../types.js';
import { WIKI_SPECIAL_FILES } from '../constants.js';
import { formatError } from '../errors.js';

export function formatLogEntry(entry: LogEntry): string {
  const date = entry.timestamp.slice(0, 10);
  const lines = [
    `## [${date}] ${entry.operation} | ${entry.description}`,
    '',
    `**Time:** ${entry.timestamp}`,
  ];
  if (entry.pages_affected?.length) {
    lines.push('', '**Pages Affected:**');
    entry.pages_affected.forEach(p => lines.push(`- ${p}`));
  }
  if (entry.details) {
    lines.push('', entry.details);
  }
  lines.push('', '---', '');
  return lines.join('\n');
}

export function parseLogEntries(logContent: string): string[] {
  return logContent
    .split(/\n(?=## \[)/)
    .map(s => s.trim())
    .filter(s => s.startsWith('## ['));
}

const LOG_HEADER = '# Wiki Activity Log\n\n';

export function registerLogTools(server: McpServer, gh: GitHubClient): void {

  server.registerTool(
    'wiki_append_log',
    {
      title: 'Append Log Entry',
      description: `Append an entry to the wiki's append-only activity log (log.md).

Call this after every significant operation: source ingest, bulk page updates, lint runs, contradiction flags.

Args:
  - operation: Type of operation performed
  - description: Brief description of what happened
  - pages_affected: List of page paths touched (optional)
  - details: Additional markdown content (optional — use for long summaries)

Returns: { message } on success.`,
      inputSchema: z.object({
        operation: z.enum(['ingest', 'query', 'update', 'lint', 'create', 'delete', 'schema'])
          .describe('Operation type'),
        description: z.string().min(1).max(500).describe('Brief description'),
        pages_affected: z.array(z.string()).optional().describe('Page paths touched'),
        details: z.string().optional().describe('Additional markdown details'),
      }).strict(),
      outputSchema: z.object({ message: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ operation, description, pages_affected, details }) => {
      try {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          operation: operation as LogOperation,
          description,
          pages_affected,
          details,
        };
        const newSection = formatLogEntry(entry);

        let existingContent = '';
        let existingSha: string | undefined;
        try {
          const existing = await gh.readFile(WIKI_SPECIAL_FILES.log);
          existingContent = existing.content;
          existingSha = existing.sha;
        } catch {
          existingContent = LOG_HEADER;
        }

        // Prepend new entry (newest first)
        const headerEnd = existingContent.indexOf('\n\n') + 2;
        const header = existingContent.slice(0, headerEnd) || LOG_HEADER;
        const body = existingContent.slice(headerEnd);
        const updated = header + newSection + body;

        await gh.writeFile(WIKI_SPECIAL_FILES.log, updated, `wiki: log ${operation}`, existingSha);
        const output = { message: 'Log entry appended' };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatError(err) }] };
      }
    }
  );

  server.registerTool(
    'wiki_get_log',
    {
      title: 'Get Wiki Log',
      description: `Read recent entries from the wiki activity log.

Args:
  - limit: Number of most recent entries to return (default 10)
  - operation: Filter by operation type (optional)

Returns: Array of recent log entry strings.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(10),
        operation: z.enum(['ingest', 'query', 'update', 'lint', 'create', 'delete', 'schema']).optional(),
      }).strict(),
      outputSchema: z.object({ count: z.number(), entries: z.array(z.string()) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, operation }) => {
      try {
        const { content } = await gh.readFile(WIKI_SPECIAL_FILES.log);
        let entries = parseLogEntries(content);
        if (operation) entries = entries.filter(e => e.includes(`] ${operation} |`));
        entries = entries.slice(0, limit);
        const output = { count: entries.length, entries };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: output };
      } catch {
        return { content: [{ type: 'text' as const, text: `No log found yet. Call wiki_append_log to create it.` }] };
      }
    }
  );
}
