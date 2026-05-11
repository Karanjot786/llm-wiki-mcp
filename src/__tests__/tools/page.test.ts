import { describe, it, expect } from 'vitest';
import { buildPageContent, parsePage, slugify } from '../../tools/page.js';
import type { WikiPageFrontmatter } from '../../types.js';

describe('page tools helpers', () => {
  it('slugify converts title to kebab-case path', () => {
    expect(slugify('Machine Learning')).toBe('machine-learning');
    expect(slugify('GPT-4 Overview!')).toBe('gpt-4-overview');
  });

  it('buildPageContent produces valid frontmatter + body', () => {
    const fm: WikiPageFrontmatter = {
      title: 'Test Page',
      type: 'concept',
      created: '2026-05-11T00:00:00Z',
      updated: '2026-05-11T00:00:00Z',
      sources: [],
      tags: ['ai'],
      status: 'draft',
      related_pages: [],
      inbound_links_count: 0,
      outbound_links_count: 0,
    };
    const raw = buildPageContent(fm, '# Test\nContent here');
    expect(raw).toContain('title: Test Page');
    expect(raw).toContain('type: concept');
    expect(raw).toContain('# Test\nContent here');
    expect(raw.startsWith('---')).toBe(true);
  });

  it('parsePage extracts frontmatter and content correctly', () => {
    const raw = `---
title: Hello World
type: topic
created: "2026-05-11T00:00:00Z"
updated: "2026-05-11T00:00:00Z"
sources: []
tags: [testing]
status: complete
related_pages: []
inbound_links_count: 0
outbound_links_count: 0
---
# Hello World

Some body text here.`;
    const { frontmatter, content } = parsePage(raw);
    expect(frontmatter.title).toBe('Hello World');
    expect(frontmatter.type).toBe('topic');
    expect(content.trim()).toBe('# Hello World\n\nSome body text here.');
  });
});
