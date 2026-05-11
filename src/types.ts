export type PageType = 'entity' | 'concept' | 'topic' | 'source' | 'comparison' | 'synthesis';
export type PageStatus = 'draft' | 'complete' | 'needs_sources' | 'deleted';
export type ContradictionStatus = 'unresolved' | 'resolved';
export type ContradictionSeverity = 'low' | 'medium' | 'high';
export type LogOperation = 'ingest' | 'query' | 'update' | 'lint' | 'create' | 'delete' | 'schema';

export interface WikiPageFrontmatter {
  title: string;
  type: PageType;
  created: string;       // ISO timestamp
  updated: string;       // ISO timestamp
  sources: string[];     // source page paths
  tags: string[];
  status: PageStatus;
  related_pages: string[];
  inbound_links_count: number;
  outbound_links_count: number;
}

export interface WikiPage {
  path: string;           // e.g. "pages/concepts/machine-learning.md"
  sha: string;            // GitHub blob SHA, needed for updates
  frontmatter: WikiPageFrontmatter;
  content: string;        // markdown body (without frontmatter)
  raw: string;            // full file content including frontmatter
}

export interface SearchResult {
  path: string;
  title: string;
  type: PageType;
  excerpt: string;        // snippet around match, ~200 chars
  rank: number;           // BM25 rank (lower = better match)
}

export interface Contradiction {
  id: string;             // e.g. "CONT-2026-001"
  page_a: string;
  claim_a: string;
  page_b: string;
  claim_b: string;
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  created: string;
  resolved_at?: string;
  resolution?: string;
}

export interface LogEntry {
  timestamp: string;
  operation: LogOperation;
  description: string;
  pages_affected?: string[];
  details?: string;
}

export interface LintIssue {
  rule: string;
  severity: 'warning' | 'error';
  path: string;
  message: string;
}

export interface WikiStats {
  total_pages: number;
  by_type: Record<PageType, number>;
  total_sources: number;
  unresolved_contradictions: number;
  health_score: number;   // 0-100
  top_linked: Array<{ path: string; title: string; inbound_links: number }>;
}
