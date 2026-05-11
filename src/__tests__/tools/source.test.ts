import { describe, it, expect } from 'vitest';
import { generateSourceId, buildSourceFrontmatter } from '../../tools/source.js';

describe('source tool helpers', () => {
  it('generateSourceId produces slug from title', () => {
    const id = generateSourceId('Attention Is All You Need', '2017-06-12');
    expect(id).toMatch(/^attention-is-all-you-need-2017/);
  });

  it('generateSourceId handles special characters', () => {
    const id = generateSourceId('LLMs: A Survey (2024)', '2024-01-01');
    expect(id).toMatch(/^llms-a-survey-2024/);
    expect(id).not.toContain(':');
    expect(id).not.toContain('(');
  });

  it('buildSourceFrontmatter returns valid frontmatter object', () => {
    const fm = buildSourceFrontmatter('Test Source', 'https://example.com', 'url');
    expect(fm.type).toBe('source');
    expect(fm.title).toBe('Test Source');
    expect(fm.status).toBe('complete');
  });
});
