import Database from 'better-sqlite3';
import type { WikiPage, PageType, SearchResult } from './types.js';

export interface CachePageRow {
  path: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  status: string;
  updated: string;
  sha: string;
}

export class WikiCache {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        path TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'complete',
        updated TEXT NOT NULL,
        sha TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        title,
        content,
        tags,
        content=pages,
        content_rowid=rowid,
        tokenize='porter ascii'
      );

      CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
        INSERT INTO pages_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
        INSERT INTO pages_fts(pages_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO pages_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;
    `);
  }

  upsert(page: WikiPage): void {
    const stmt = this.db.prepare(`
      INSERT INTO pages (path, type, title, content, tags, status, updated, sha)
      VALUES (@path, @type, @title, @content, @tags, @status, @updated, @sha)
      ON CONFLICT(path) DO UPDATE SET
        type=excluded.type, title=excluded.title, content=excluded.content,
        tags=excluded.tags, status=excluded.status, updated=excluded.updated, sha=excluded.sha
    `);
    stmt.run({
      path: page.path,
      type: page.frontmatter.type,
      title: page.frontmatter.title,
      content: page.content,
      tags: JSON.stringify(page.frontmatter.tags),
      status: page.frontmatter.status,
      updated: page.frontmatter.updated,
      sha: page.sha,
    });
  }

  remove(path: string): void {
    this.db.prepare('DELETE FROM pages WHERE path = ?').run(path);
  }

  search(query: string, limit = 10): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT p.path, p.type, p.title, p.content,
             rank AS bm25_rank
      FROM pages_fts
      JOIN pages p ON pages_fts.rowid = p.rowid
      WHERE pages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Array<{ path: string; type: string; title: string; content: string; bm25_rank: number }>;

    return rows.map(row => ({
      path: row.path,
      title: row.title,
      type: row.type as PageType,
      excerpt: this.makeExcerpt(row.content, query),
      rank: row.bm25_rank,
    }));
  }

  private makeExcerpt(content: string, query: string): string {
    const words = query.toLowerCase().split(/\s+/);
    const lower = content.toLowerCase();
    let bestIdx = 0;
    for (const word of words) {
      const idx = lower.indexOf(word);
      if (idx !== -1) { bestIdx = idx; break; }
    }
    const start = Math.max(0, bestIdx - 80);
    const end = Math.min(content.length, bestIdx + 120);
    let excerpt = content.slice(start, end).trim();
    if (start > 0) excerpt = '…' + excerpt;
    if (end < content.length) excerpt = excerpt + '…';
    return excerpt;
  }

  getByPath(path: string): CachePageRow | null {
    return (this.db.prepare('SELECT * FROM pages WHERE path = ?').get(path) as CachePageRow) ?? null;
  }

  listByType(type: PageType): CachePageRow[] {
    return this.db.prepare("SELECT * FROM pages WHERE type = ? AND status != 'deleted' ORDER BY updated DESC").all(type) as CachePageRow[];
  }

  listAll(): CachePageRow[] {
    return this.db.prepare("SELECT * FROM pages WHERE status != 'deleted' ORDER BY type, title").all() as CachePageRow[];
  }

  countByType(): Record<string, number> {
    const rows = this.db.prepare("SELECT type, COUNT(*) as n FROM pages WHERE status != 'deleted' GROUP BY type").all() as Array<{ type: string; n: number }>;
    return Object.fromEntries(rows.map(r => [r.type, r.n]));
  }

  findBacklinks(title: string): string[] {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wikilinkRe = new RegExp(`\\[\\[${escaped}(?:\\|[^\\]]+)?\\]\\]`, 'i');
    const rows = this.db.prepare(
      "SELECT path, content FROM pages WHERE status != 'deleted'"
    ).all() as Array<{ path: string; content: string }>;
    return rows
      .filter(r => wikilinkRe.test(r.content) || r.content.includes(`](pages/`))
      .map(r => r.path);
  }

  private static readonly STOP_WORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of',
    'with','by','from','is','was','are','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','this','that','these','those','it','its',
  ]);

  scorePagesByKeywords(topic: string, limit = 5): Array<{ path: string; title: string; type: string; score: number; excerpt: string }> {
    const tokens = topic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !WikiCache.STOP_WORDS.has(w));

    if (tokens.length === 0) return [];

    const rows = this.db.prepare(
      "SELECT path, title, type, content FROM pages WHERE status != 'deleted'"
    ).all() as Array<{ path: string; title: string; type: string; content: string }>;

    const scored = rows.map(row => {
      const titleLower = row.title.toLowerCase();
      const contentLower = row.content.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        const re = new RegExp(token, 'g');
        score += (titleLower.match(re) ?? []).length * 3;
        score += Math.min((contentLower.match(re) ?? []).length, 10);
      }
      const normalized = score / tokens.length;
      const bodyStart = row.content.indexOf('\n\n');
      const body = bodyStart >= 0 ? row.content.slice(bodyStart).trim() : row.content;
      const excerpt = body.slice(0, 120).replace(/\n/g, ' ');
      return { path: row.path, title: row.title, type: row.type, score: normalized, excerpt };
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  close(): void {
    this.db.close();
  }
}
