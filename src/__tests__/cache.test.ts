import { describe, it, expect, beforeEach } from 'vitest';
import { WikiCache } from '../cache.js';
import type { WikiPage } from '../types.js';

function makeTestPage(path: string, title: string, content: string): WikiPage {
  return {
    path,
    sha: 'testsha',
    content,
    raw: `---\ntitle: ${title}\ntype: concept\n---\n${content}`,
    frontmatter: {
      title,
      type: 'concept',
      created: '2026-05-11T00:00:00Z',
      updated: '2026-05-11T00:00:00Z',
      sources: [],
      tags: ['test'],
      status: 'complete',
      related_pages: [],
      inbound_links_count: 0,
      outbound_links_count: 0,
    },
  };
}

describe('WikiCache', () => {
  let cache: WikiCache;

  beforeEach(() => {
    cache = new WikiCache(':memory:');
  });

  it('upserts a page and retrieves it via search', () => {
    const page = makeTestPage('pages/concepts/test.md', 'Test Concept', 'A concept about testing software');
    cache.upsert(page);
    const results = cache.search('testing software');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Concept');
    expect(results[0].path).toBe('pages/concepts/test.md');
  });

  it('returns excerpt around match', () => {
    const page = makeTestPage('pages/concepts/ml.md', 'Machine Learning', 'Machine learning enables computers to learn from data without being explicitly programmed');
    cache.upsert(page);
    const results = cache.search('learn from data');
    expect(results[0].excerpt).toContain('data');
  });

  it('removes a page so it no longer appears in search', () => {
    const page = makeTestPage('pages/concepts/temp.md', 'Temporary', 'This page is temporary and will be removed');
    cache.upsert(page);
    cache.remove('pages/concepts/temp.md');
    const results = cache.search('temporary');
    expect(results).toHaveLength(0);
  });

  it('updates existing page on re-upsert', () => {
    const page = makeTestPage('pages/concepts/update.md', 'Update Test', 'Original content here');
    cache.upsert(page);
    const updated = { ...page, content: 'Updated content entirely different', frontmatter: { ...page.frontmatter, title: 'Updated Title' } };
    cache.upsert(updated);
    const results = cache.search('Updated content');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Updated Title');
  });

  it('getByPath returns stored page metadata', () => {
    const page = makeTestPage('pages/concepts/fetch.md', 'Fetch Test', 'Some content');
    cache.upsert(page);
    const found = cache.getByPath('pages/concepts/fetch.md');
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Fetch Test');
  });

  it('listByType filters correctly', () => {
    cache.upsert(makeTestPage('pages/concepts/a.md', 'Concept A', 'concept content'));
    const entityPage: WikiPage = {
      ...makeTestPage('pages/entities/b.md', 'Entity B', 'entity content'),
      frontmatter: {
        ...makeTestPage('pages/entities/b.md', 'Entity B', 'entity content').frontmatter,
        type: 'entity',
      },
    };
    cache.upsert(entityPage);
    const concepts = cache.listByType('concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0].title).toBe('Concept A');
  });
});
