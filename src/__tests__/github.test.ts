import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExec = vi.fn();

const { GitHubClient } = await import('../github.js');

describe('GitHubClient', () => {
  let client: InstanceType<typeof import('../github.js').GitHubClient>;

  beforeEach(() => {
    mockExec.mockReset();
    client = new GitHubClient('owner', 'repo', mockExec);
  });

  it('readFile decodes base64 content and returns sha', async () => {
    const content = 'hello world';
    const encoded = Buffer.from(content).toString('base64');
    mockExec.mockReturnValue(JSON.stringify({ content: encoded + '\n', sha: 'abc123' }));

    const result = await client.readFile('pages/test.md');
    expect(result.content).toBe(content);
    expect(result.sha).toBe('abc123');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('gh api repos/owner/repo/contents/pages/test.md'),
      expect.any(Object)
    );
  });

  it('writeFile creates new file with PUT via stdin JSON', async () => {
    mockExec.mockReturnValue(JSON.stringify({ content: { sha: 'newsha456' } }));
    const sha = await client.writeFile('pages/new.md', '# New Page', 'feat: add new page');
    expect(sha).toBe('newsha456');
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('--method PUT'),
      expect.objectContaining({ input: expect.stringContaining('"message"') })
    );
  });

  it('validatePath rejects path traversal', async () => {
    await expect(client.readFile('../../../etc/passwd')).rejects.toThrow('path traversal');
  });

  it('validatePath rejects shell-special chars', async () => {
    await expect(client.readFile('pages/$(evil).md')).rejects.toThrow('Invalid path');
  });

  it('listFiles returns array of file entries', async () => {
    mockExec.mockReturnValue(JSON.stringify([
      { name: 'foo.md', path: 'pages/foo.md', sha: 'sha1', type: 'file' },
      { name: 'bar.md', path: 'pages/bar.md', sha: 'sha2', type: 'file' },
    ]));
    const files = await client.listFiles('pages');
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('foo.md');
  });

  it('readFile throws on 404', async () => {
    mockExec.mockImplementation(() => { throw new Error('404'); });
    await expect(client.readFile('missing.md')).rejects.toThrow('not found');
  });
});
