import type { PageType } from './types.js';

/** Maximum characters for source content fetched by wiki_add_source and returned in tool responses. */
export const CHARACTER_LIMIT = 25_000;

export const PAGE_TYPES: readonly PageType[] = [
  'entity', 'concept', 'topic', 'source', 'comparison', 'synthesis'
] as const;

export const WIKI_DIRS = {
  pages: 'pages',
  entities: 'pages/entities',
  concepts: 'pages/concepts',
  topics: 'pages/topics',
  sources: 'pages/sources',
  comparisons: 'pages/comparisons',
  synthesis: 'pages/synthesis',
} as const;

export const WIKI_SPECIAL_FILES = {
  index: 'index.md',
  log: 'log.md',
  contradictions: 'contradictions.md',
  schema: 'WIKI_SCHEMA.md',
} as const;

export const WIKI_SCHEMA_TEMPLATE = `# Wiki Schema

## Directory Structure
- \`pages/entities/\` — People, organizations, locations
- \`pages/concepts/\` — Core ideas, technologies, methodologies
- \`pages/topics/\` — Domain syntheses and overviews
- \`pages/sources/\` — One summary page per ingested source
- \`pages/comparisons/\` — Structured A vs B analyses
- \`pages/synthesis/\` — Original LLM analyses

## Page Naming
- Use kebab-case: \`machine-learning.md\`, \`andrej-karpathy.md\`
- Be specific: \`attention-mechanism-transformers.md\` not \`attention.md\`

## Frontmatter Requirements
Every page must include: title, type, created, updated, sources, tags, status, related_pages

## Ingest Workflow
1. Call wiki_add_source with URL or text
2. Read returned content thoroughly
3. Identify entities, concepts, topics to create/update
4. Call wiki_create_page or wiki_update_page for each affected page
5. Call wiki_append_log to record the session
6. Call wiki_flag_contradiction if new info contradicts existing pages

## Linking Convention
Use markdown links: [page title](../concepts/page-name.md)
Always create bidirectional links — if A links to B, B should mention A.
`;

export const INDEX_TEMPLATE = `# Wiki Index

**Last Updated:** {{date}}
**Total Pages:** 0

*This index is maintained automatically. Use wiki_get_stats for current metrics.*

## Pages by Type

*(No pages yet — use wiki_add_source or wiki_create_page to begin)*
`;
