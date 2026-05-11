import { execSync, type ExecSyncOptionsWithStringEncoding } from 'child_process';
import { ghError } from './errors.js';

type ExecFn = (cmd: string, opts: ExecSyncOptionsWithStringEncoding) => string;

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
}

export class GitHubClient {
  private owner: string;
  private repo: string;
  private exec: ExecFn;

  constructor(owner: string, repo: string, execFn?: ExecFn) {
    this.owner = owner;
    this.repo = repo;
    this.exec = execFn ?? ((cmd, opts) => execSync(cmd, opts) as unknown as string);
  }

  private run(cmd: string): string {
    try {
      return this.exec(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      const stderr = e.stderr ?? e.message ?? String(err);
      throw new Error(stderr);
    }
  }

  async readFile(path: string): Promise<{ content: string; sha: string }> {
    try {
      const raw = this.run(
        `gh api repos/${this.owner}/${this.repo}/contents/${path}`
      );
      const data = JSON.parse(raw) as { content: string; sha: string };
      const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
      return { content, sha: data.sha };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) throw new Error(`File not found: ${path}`);
      throw new Error(ghError(msg, path));
    }
  }

  async writeFile(path: string, content: string, message: string, existingSha?: string): Promise<string> {
    const encoded = Buffer.from(content).toString('base64');
    const shaField = existingSha ? `--field sha="${existingSha}"` : '';
    try {
      const raw = this.run(
        `gh api repos/${this.owner}/${this.repo}/contents/${path} ` +
        `--method PUT ` +
        `--field message="${message.replace(/"/g, '\\"')}" ` +
        `--field content="${encoded}" ` +
        shaField
      );
      const data = JSON.parse(raw) as { content: { sha: string } };
      return data.content.sha;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(ghError(msg, path));
    }
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    try {
      this.run(
        `gh api repos/${this.owner}/${this.repo}/contents/${path} ` +
        `--method DELETE ` +
        `--field message="${message.replace(/"/g, '\\"')}" ` +
        `--field sha="${sha}"`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(ghError(msg, path));
    }
  }

  async listFiles(dir: string): Promise<GitHubFile[]> {
    try {
      const raw = this.run(
        `gh api repos/${this.owner}/${this.repo}/contents/${dir}`
      );
      const data = JSON.parse(raw) as GitHubFile[];
      return Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) return [];
      throw new Error(ghError(msg, dir));
    }
  }

  async getFileSha(path: string): Promise<string | null> {
    try {
      const { sha } = await this.readFile(path);
      return sha;
    } catch {
      return null;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    return (await this.getFileSha(path)) !== null;
  }
}
