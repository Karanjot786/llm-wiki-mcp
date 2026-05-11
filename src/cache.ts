import Database from 'better-sqlite3';
import type { WikiPage, PageType, SearchResult } from './types.js';

export interface CachePageRow {
  path: string;
  type: string;
  title: string;
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

  close(): void {
    this.db.close();
  }
}
