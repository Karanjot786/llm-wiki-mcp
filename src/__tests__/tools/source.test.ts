import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSourceId, buildSourceFrontmatter, registerSourceTools } from '../../tools/source.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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

// Helper: create a minimal mock server that captures tool handlers
function makeTestServer() {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      handlers.set(name, handler as (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>);
    },
  } as unknown as McpServer;
  return { server, handlers };
}

function makeMockGh() {
  return {
    writeFile: vi.fn().mockResolvedValue('sha123'),
    readFile: vi.fn(),
  };
}

function makeMockCache() {
  return {
    upsert: vi.fn(),
    listByType: vi.fn().mockReturnValue([]),
  };
}

describe('wiki_add_source handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns error when type="url" but url is missing', async () => {
    const { server, handlers } = makeTestServer();
    registerSourceTools(server, makeMockGh() as never, makeMockCache() as never);
    const handler = handlers.get('wiki_add_source')!;
    const result = await handler({ type: 'url', tags: [] });
    expect(result.content[0].text).toContain('url is required');
  });

  it('returns error when type="text" but raw_content is missing', async () => {
    const { server, handlers } = makeTestServer();
    registerSourceTools(server, makeMockGh() as never, makeMockCache() as never);
    const handler = handlers.get('wiki_add_source')!;
    const result = await handler({ type: 'text', tags: [] });
    expect(result.content[0].text).toContain('raw_content is required');
  });

  it('returns error when https URL is not used (SSRF protection)', async () => {
    const { server, handlers } = makeTestServer();
    registerSourceTools(server, makeMockGh() as never, makeMockCache() as never);
    const handler = handlers.get('wiki_add_source')!;
    const result = await handler({ type: 'url', url: 'http://example.com', tags: [] });
    expect(result.content[0].text).toContain('Only https://');
  });

  it('returns error for localhost URL (SSRF protection)', async () => {
    const { server, handlers } = makeTestServer();
    registerSourceTools(server, makeMockGh() as never, makeMockCache() as never);
    const handler = handlers.get('wiki_add_source')!;
    const result = await handler({ type: 'url', url: 'https://localhost/secret', tags: [] });
    expect(result.content[0].text).toContain('Blocked');
  });

  it('returns error for 0.0.0.0 URL (SSRF protection)', async () => {
    const { server, handlers } = makeTestServer();
    registerSourceTools(server, makeMockGh() as never, makeMockCache() as never);
    const handler = handlers.get('wiki_add_source')!;
    const result = await handler({ type: 'url', url: 'https://0.0.0.0/test', tags: [] });
    expect(result.content[0].text).toContain('Blocked');
  });
});
