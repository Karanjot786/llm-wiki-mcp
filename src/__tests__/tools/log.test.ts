import { describe, it, expect } from 'vitest';
import { formatLogEntry, parseLogEntries } from '../../tools/log.js';

describe('log tool helpers', () => {
  it('formatLogEntry produces markdown section with timestamp', () => {
    const entry = formatLogEntry({
      timestamp: '2026-05-11T10:00:00.000Z',
      operation: 'ingest',
      description: 'Added article about transformers',
      pages_affected: ['pages/concepts/transformer.md'],
    });
    expect(entry).toContain('## [2026-05-11]');
    expect(entry).toContain('ingest');
    expect(entry).toContain('Added article about transformers');
    expect(entry).toContain('transformer.md');
  });

  it('parseLogEntries splits log file into individual entries', () => {
    const logContent = `# Wiki Activity Log\n\n## [2026-05-11] ingest\n\nFirst entry.\n\n## [2026-05-10] update\n\nSecond entry.`;
    const entries = parseLogEntries(logContent);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('First entry');
  });
});
