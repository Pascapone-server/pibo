import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type ServerConfig } from './config.js';
import { configCommand } from './config-command.js';
import { ErrorCode, formatCliError } from './errors.js';
import {
  type PythonRuntimeSpec,
  getPythonRuntimePaths,
  installPythonRuntime,
  printPythonRuntimeDoctor,
  removePythonRuntime,
} from './python-runtime.js';

export type RegistryAction = 'help' | 'list' | 'show' | 'doctor' | 'install' | 'remove';

export interface RegistryCommandOptions {
  action: RegistryAction;
  name?: string;
  configPath?: string;
  runSetup?: boolean;
  browserMode?: 'headless' | 'headful';
}

interface RegistryEntry {
  name: string;
  description: string;
  runtime: PythonRuntimeSpec;
  serverArgs: string[];
  serverEnv?: Record<string, string>;
  supportsBrowserMode?: boolean;
  notes: string[];
}

interface ServerConfigResult {
  config: ServerConfig;
  warnings: string[];
}

const REGISTRY: RegistryEntry[] = [
  {
    name: 'browser-use',
    description: 'Local Browser Use MCP server for browser automation via stdio.',
    runtime: {
      packageName: 'browser-use[cli]',
      executableName: 'browser-use',
      pythonVersion: '3.12',
      postInstallArgs: ['install'],
    },
    serverArgs: ['--mcp'],
    serverEnv: {
      BROWSER_USE_HEADLESS: 'true',
    },
    supportsBrowserMode: true,
    notes: [
      'Requires uv on PATH. uv manages the Python runtime and virtual environment.',
      'LLM-backed Browser Use tools need the relevant API key in the environment when the MCP server starts.',
      'The server is only added to mcp_servers.json; it is not bundled as a Pibo dependency.',
    ],
  },
];

function findRegistryEntry(name: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.name === name);
}

function findXAuthority(): string | undefined {
  if (process.env.XAUTHORITY) return process.env.XAUTHORITY;

  const homeXAuthority = join(homedir(), '.Xauthority');
  if (existsSync(homeXAuthority)) return homeXAuthority;

  const uid = process.getuid?.();
  if (uid === undefined) return undefined;

  const runUserDir = join('/run/user', String(uid));
  if (!existsSync(runUserDir)) return undefined;

  let files: string[];
  try {
    files = readdirSync(runUserDir);
  } catch {
    return undefined;
  }

  const file = files.find((name) => name.startsWith('.mutter-Xwaylandauth.'));
  return file ? join(runUserDir, file) : undefined;
}

function getX11SocketPath(display: string): string | undefined {
  const match = display.match(/^:(\d+)/);
  return match ? `/tmp/.X11-unix/X${match[1]}` : undefined;
}

function findLinuxDisplay(): string | undefined {
  if (process.env.DISPLAY) return process.env.DISPLAY;
  return existsSync('/tmp/.X11-unix/X0') ? ':0' : undefined;
}

function checkLinuxDisplay(env: Record<string, string>): string | undefined {
  const display = env.DISPLAY;
  if (!display) return 'DISPLAY is not set.';

  const socketPath = getX11SocketPath(display);
  if (socketPath && !existsSync(socketPath)) {
    return `No X11 display socket found at ${socketPath}.`;
  }

  const result = spawnSync('xset', ['q'], {
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    timeout: 2000,
  });

  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return undefined;
  }

  if (result.status === 0) return undefined;

  const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
  return detail ? `Cannot connect to display ${display}: ${detail}` : `Cannot connect to display ${display}.`;
}

function createHeadfulEnv(): { env: Record<string, string>; warning?: string } {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return {
      env: {
        BROWSER_USE_HEADLESS: 'false',
      },
    };
  }

  const display = findLinuxDisplay();
  if (!display) {
    return {
      env: { BROWSER_USE_HEADLESS: 'true' },
      warning:
        'Headful browser requested, but no graphical display was detected. Falling back to headless mode. On Linux, run from a desktop session with DISPLAY set or install/use Xvfb.',
    };
  }

  const env: Record<string, string> = {
    BROWSER_USE_HEADLESS: 'false',
    DISPLAY: display,
  };

  const xauthority = findXAuthority();
  if (xauthority) env.XAUTHORITY = xauthority;

  const displayError = checkLinuxDisplay(env);
  if (displayError) {
    return {
      env: { BROWSER_USE_HEADLESS: 'true' },
      warning: `Headful browser requested, but the graphical display is not usable. ${displayError} Falling back to headless mode.`,
    };
  }

  return { env };
}

function buildServerConfig(
  entry: RegistryEntry,
  options: RegistryCommandOptions = { action: 'show' },
): ServerConfigResult {
  const paths = getPythonRuntimePaths(entry.name, entry.runtime);
  const warnings: string[] = [];
  let env = entry.serverEnv;

  if (options.browserMode === 'headful' && entry.supportsBrowserMode) {
    const result = createHeadfulEnv();
    env = result.env;
    if (result.warning) warnings.push(result.warning);
  }

  return {
    config: {
      command: paths.executablePath,
      args: entry.serverArgs,
      ...(env ? { env } : {}),
    },
    warnings,
  };
}

function printServerConfigWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.error(`Warning: ${warning}`);
  }
}

function createHeadlessServerConfig(entry: RegistryEntry): ServerConfig {
  const paths = getPythonRuntimePaths(entry.name, entry.runtime);
  return {
    command: paths.executablePath,
    args: entry.serverArgs,
    ...(entry.serverEnv ? { env: entry.serverEnv } : {}),
  };
}

function printRegistryHelp(): void {
  console.log(`
MCP server registry

Commands:
  pibo mcp registry list                         List built-in MCP server presets
  pibo mcp registry show <name>                  Show one preset
  pibo mcp registry doctor <name>                Check runtime prerequisites
  pibo mcp registry install <name>               Install setup deps and add preset to mcp_servers.json
  pibo mcp registry install <name> --no-setup    Only add preset to mcp_servers.json
  pibo mcp registry install <name> --headful     Add preset for a visible local browser
  pibo mcp registry remove <name>                Remove config and local runtime
  pibo mcp registry help                         Show this help

Examples:
  pibo mcp registry list
  pibo mcp registry show browser-use
  pibo mcp registry doctor browser-use
  pibo mcp registry install browser-use
  pibo mcp registry install browser-use --headful
`);
}

function printEntry(entry: RegistryEntry): void {
  const paths = getPythonRuntimePaths(entry.name, entry.runtime);

  console.log(`${entry.name}`);
  console.log(`  ${entry.description}`);
  console.log('');
  console.log('Runtime:');
  console.log(`  package: ${entry.runtime.packageName}`);
  console.log(`  python: ${entry.runtime.pythonVersion}`);
  console.log(`  path: ${paths.rootDir}`);
  console.log('');
  if (entry.supportsBrowserMode) {
    console.log('Browser mode:');
    console.log('  default: headless');
    console.log('  headful: pibo mcp registry install browser-use --headful');
    console.log('');
  }
  console.log('Server config:');
  console.log(JSON.stringify(createHeadlessServerConfig(entry), null, 2));

  if (entry.notes.length > 0) {
    console.log('');
    console.log('Notes:');
    for (const note of entry.notes) {
      console.log(`  - ${note}`);
    }
  }
}

function printHeadfulDoctor(): void {
  const result = createHeadfulEnv();

  if (result.env.BROWSER_USE_HEADLESS === 'false') {
    const display = result.env.DISPLAY ? ` (${result.env.DISPLAY})` : '';
    console.log(`  headful display: available${display}`);
    return;
  }

  console.log('  headful display: unavailable');
  if (result.warning) console.log(`    ${result.warning}`);
}

async function installEntry(
  entry: RegistryEntry,
  options: RegistryCommandOptions,
): Promise<void> {
  if (options.runSetup !== false) {
    await installPythonRuntime(entry.name, entry.runtime);
  }

  const serverConfig = buildServerConfig(entry, options);
  printServerConfigWarnings(serverConfig.warnings);

  await configCommand({
    action: 'add',
    name: entry.name,
    serverJson: JSON.stringify(serverConfig.config),
    configPath: options.configPath,
  });
}

export async function registryCommand(options: RegistryCommandOptions): Promise<void> {
  if (options.action === 'help') {
    printRegistryHelp();
    return;
  }

  if (options.action === 'list') {
    for (const entry of REGISTRY) {
      console.log(`${entry.name}\t${entry.description}`);
    }
    return;
  }

  if (!options.name) {
    throw new Error(
      formatCliError({
        code: ErrorCode.CLIENT_ERROR,
        type: 'MISSING_ARGUMENT',
        message: `registry ${options.action} requires <name>`,
        suggestion: 'Example: pibo mcp registry install browser-use',
      }),
    );
  }

  const entry = findRegistryEntry(options.name);
  if (!entry) {
    throw new Error(
      formatCliError({
        code: ErrorCode.CLIENT_ERROR,
        type: 'MCP_REGISTRY_ENTRY_NOT_FOUND',
        message: `Registry entry "${options.name}" not found`,
        details: `Available entries: ${REGISTRY.map((item) => item.name).join(', ')}`,
      }),
    );
  }

  if (options.action === 'show') {
    printEntry(entry);
    return;
  }

  if (options.action === 'doctor') {
    await printPythonRuntimeDoctor(entry.name, entry.runtime);
    if (entry.supportsBrowserMode) printHeadfulDoctor();
    return;
  }

  if (options.action === 'install') {
    await installEntry(entry, options);
    return;
  }

  await configCommand({
    action: 'remove',
    name: entry.name,
    configPath: options.configPath,
  });
  await removePythonRuntime(entry.name, entry.runtime);
}
