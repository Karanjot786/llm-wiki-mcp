import { createInterface } from 'node:readline/promises';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const HOME = homedir();
const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

const CLIENTS = [
  { id: 'claude-desktop', name: 'Claude Desktop' },
  { id: 'claude-code', name: 'Claude Code CLI' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'windsurf', name: 'Windsurf' },
  { id: 'vscode', name: 'VS Code / GitHub Copilot' },
  { id: 'zed', name: 'Zed' },
  { id: 'continue', name: 'Continue.dev' },
  { id: 'cline', name: 'Cline' },
  { id: 'roo-code', name: 'Roo Code' },
] as const;

type ClientId = (typeof CLIENTS)[number]['id'];

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(file: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function mergeServer(
  configFile: string,
  rootKey: string,
  serverName: string,
  serverEntry: Record<string, unknown>,
): void {
  const config = readJson(configFile);
  if (typeof config[rootKey] !== 'object' || config[rootKey] === null) {
    config[rootKey] = {};
  }
  (config[rootKey] as Record<string, unknown>)[serverName] = serverEntry;
  writeJson(configFile, config);
}

function installForClient(
  clientId: ClientId,
  cmd: string,
  args: string[],
  env: Record<string, string>,
): void {
  const base = { command: cmd, args, env };
  const baseWithType = { type: 'stdio', command: cmd, args, env };

  switch (clientId) {
    case 'claude-desktop': {
      const cfgFile = IS_WIN
        ? join(process.env['APPDATA'] ?? HOME, 'Claude', 'claude_desktop_config.json')
        : IS_MAC
          ? join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
          : join(HOME, '.config', 'claude', 'claude_desktop_config.json');
      mergeServer(cfgFile, 'mcpServers', 'wiki-hub', base);
      console.log(`  ✓ Claude Desktop — ${cfgFile}`);
      break;
    }

    case 'claude-code': {
      const envFlags = Object.entries(env)
        .map(([k, v]) => `-e ${k}=${v}`)
        .join(' ');
      const cliCmd = `claude mcp add --transport stdio --scope user llm-wiki ${envFlags} -- ${cmd} ${args.join(' ')}`;
      try {
        execSync(cliCmd, { stdio: 'inherit' });
        console.log(`  ✓ Claude Code CLI — added via 'claude mcp add'`);
      } catch {
        const fallback = join(HOME, '.claude.json');
        mergeServer(fallback, 'mcpServers', 'wiki-hub', base);
        console.log(`  ✓ Claude Code CLI — wrote to ${fallback} (claude CLI not in PATH)`);
      }
      break;
    }

    case 'cursor': {
      const cfgFile = join(HOME, '.cursor', 'mcp.json');
      mergeServer(cfgFile, 'mcpServers', 'wiki-hub', baseWithType);
      console.log(`  ✓ Cursor — ${cfgFile}`);
      break;
    }

    case 'windsurf': {
      const cfgFile = join(HOME, '.codeium', 'windsurf', 'mcp_config.json');
      mergeServer(cfgFile, 'servers', 'wiki-hub', base);
      console.log(`  ✓ Windsurf — ${cfgFile}`);
      break;
    }

    case 'vscode': {
      const cfgFile = join(process.cwd(), '.vscode', 'mcp.json');
      mergeServer(cfgFile, 'servers', 'wiki-hub', baseWithType);
      console.log(`  ✓ VS Code — ${cfgFile} (current directory)`);
      break;
    }

    case 'zed': {
      const settingsFile = join(HOME, '.config', 'zed', 'settings.json');
      const settings = readJson(settingsFile);
      if (typeof settings['context_servers'] !== 'object' || settings['context_servers'] === null) {
        settings['context_servers'] = {};
      }
      (settings['context_servers'] as Record<string, unknown>)['wiki-hub'] = {
        command: { path: cmd, args, env },
      };
      writeJson(settingsFile, settings);
      console.log(`  ✓ Zed — ${settingsFile}`);
      break;
    }

    case 'continue': {
      const yamlFile = join(HOME, '.continue', 'mcpServers', 'llm-wiki.yaml');
      mkdirSync(dirname(yamlFile), { recursive: true });
      const argsYaml = args.map(a => `  - "${a}"`).join('\n');
      const envLines = Object.entries(env)
        .map(([k, v]) => `  ${k}: "${v}"`)
        .join('\n');
      writeFileSync(
        yamlFile,
        `name: llm-wiki\ncommand: "${cmd}"\nargs:\n${argsYaml}\nenv:\n${envLines}\n`,
        'utf8',
      );
      console.log(`  ✓ Continue.dev — ${yamlFile}`);
      break;
    }

    case 'cline': {
      const base2 = IS_WIN
        ? join(process.env['APPDATA'] ?? HOME, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings')
        : IS_MAC
          ? join(HOME, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings')
          : join(HOME, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings');
      const cfgFile = join(base2, 'cline_mcp_settings.json');
      mergeServer(cfgFile, 'mcpServers', 'wiki-hub', base);
      console.log(`  ✓ Cline — ${cfgFile}`);
      break;
    }

    case 'roo-code': {
      const base2 = IS_WIN
        ? join(process.env['APPDATA'] ?? HOME, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings')
        : IS_MAC
          ? join(HOME, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings')
          : join(HOME, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
      const cfgFile = join(base2, 'cline_mcp_settings.json');
      mergeServer(cfgFile, 'mcpServers', 'wiki-hub', base);
      console.log(`  ✓ Roo Code — ${cfgFile}`);
      break;
    }
  }
}

export async function runInstaller(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nWiki Hub MCP — Setup Wizard\n');
  console.log('Configures the wiki server in your AI coding client.\n');

  CLIENTS.forEach((c, i) => console.log(`  ${i + 1}. ${c.name}`));
  console.log(`  0. All clients\n`);

  const clientInput = await rl.question('Select client (number): ');
  const clientNum = parseInt(clientInput.trim(), 10);

  let selected: ClientId[];
  if (clientNum === 0) {
    selected = CLIENTS.map(c => c.id);
  } else if (clientNum >= 1 && clientNum <= CLIENTS.length) {
    selected = [CLIENTS[clientNum - 1]!.id];
  } else {
    console.error('Invalid selection.');
    rl.close();
    process.exit(1);
  }

  console.log('');
  const owner = (await rl.question('GitHub owner (username or org): ')).trim();
  const repo = (await rl.question('GitHub repo name for your wiki: ')).trim();

  if (!owner || !repo) {
    console.error('Owner and repo are required.');
    rl.close();
    process.exit(1);
  }

  const defaultCache = join(HOME, '.wiki-mcp', 'cache.db');
  const cacheInput = (await rl.question(`Cache path [${defaultCache}]: `)).trim();
  const cachePath = cacheInput || defaultCache;

  console.log('\nHow should clients run this server?');
  console.log('  1. npx -y wiki-hub-mcp  (recommended — always uses latest published version)');
  console.log(`  2. node ${process.argv[1]}  (local path — use if you cloned this repo)\n`);
  const cmdChoice = (await rl.question('Choice [1]: ')).trim();

  rl.close();

  const useNpx = cmdChoice !== '2';
  const cmd = useNpx ? 'npx' : 'node';
  const args = useNpx ? ['-y', 'wiki-hub-mcp'] : [process.argv[1]!];

  const env: Record<string, string> = {
    WIKI_GITHUB_OWNER: owner,
    WIKI_GITHUB_REPO: repo,
  };
  if (cachePath !== defaultCache) {
    env['WIKI_CACHE_PATH'] = cachePath;
  }

  console.log('');

  for (const clientId of selected) {
    try {
      installForClient(clientId, cmd, args, env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const name = CLIENTS.find(c => c.id === clientId)?.name ?? clientId;
      console.error(`  ✗ ${name} — ${msg}`);
    }
  }

  console.log('\nDone. Restart your client to load the server.\n');
}
