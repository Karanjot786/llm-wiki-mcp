#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GitHubClient } from './github.js';
import { WikiCache } from './cache.js';
import { registerPageTools } from './tools/page.js';
import { registerSourceTools } from './tools/source.js';
import { registerSearchTools } from './tools/search.js';
import { registerLogTools } from './tools/log.js';
import { registerHealthTools } from './tools/health.js';
import { registerAnalysisTools } from './tools/analysis.js';
import { WIKI_SCHEMA_TEMPLATE, INDEX_TEMPLATE, WIKI_SPECIAL_FILES } from './constants.js';
import os from 'os';
import path from 'path';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: ${name} environment variable is required`);
    process.exit(1);
  }
  return val;
}

async function initWiki(gh: GitHubClient): Promise<void> {
  const initFiles: Array<[string, string]> = [
    [WIKI_SPECIAL_FILES.schema, WIKI_SCHEMA_TEMPLATE],
    [WIKI_SPECIAL_FILES.index, INDEX_TEMPLATE.replace('{{date}}', new Date().toISOString().slice(0, 10))],
    [WIKI_SPECIAL_FILES.log, '# Wiki Activity Log\n\n'],
    [WIKI_SPECIAL_FILES.contradictions, '# Contradictions Log\n\n'],
  ];

  for (const [filePath, content] of initFiles) {
    const exists = await gh.fileExists(filePath);
    if (!exists) {
      await gh.writeFile(filePath, content, `wiki: initialize ${filePath}`);
      console.error(`Initialized ${filePath}`);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === 'install') {
    const { runInstaller } = await import('./installer.js');
    await runInstaller();
    process.exit(0);
  }

  const owner = requireEnv('WIKI_GITHUB_OWNER');
  const repo = requireEnv('WIKI_GITHUB_REPO');
  const cachePath = process.env['WIKI_CACHE_PATH']
    ?? path.join(os.homedir(), '.wiki-mcp', 'cache.db');

  // Ensure cache directory exists
  const { mkdirSync } = await import('fs');
  mkdirSync(path.dirname(cachePath), { recursive: true });

  const gh = new GitHubClient(owner, repo);
  const cache = new WikiCache(cachePath);

  // Initialize wiki repo structure if needed
  await initWiki(gh);

  const server = new McpServer({
    name: 'llm-wiki-mcp-server',
    version: '1.0.0',
  });

  registerPageTools(server, gh, cache);
  registerSourceTools(server, gh, cache);
  registerSearchTools(server, gh, cache);
  registerLogTools(server, gh);
  registerHealthTools(server, gh, cache);
  registerAnalysisTools(server, gh);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Wiki MCP server running via stdio');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
