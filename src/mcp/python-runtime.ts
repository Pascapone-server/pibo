import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ErrorCode, formatCliError } from './errors.js';

export interface PythonRuntimeSpec {
  packageName: string;
  executableName: string;
  pythonVersion: string;
  postInstallArgs?: string[];
}

export interface PythonRuntimePaths {
  rootDir: string;
  venvDir: string;
  pythonPath: string;
  executablePath: string;
}

interface CommandResult {
  ok: boolean;
  output: string;
}

function getPiboHome(): string {
  return process.env.PIBO_HOME || join(homedir(), '.pibo');
}

export function getPythonRuntimePaths(
  name: string,
  spec: PythonRuntimeSpec,
): PythonRuntimePaths {
  const rootDir = join(getPiboHome(), 'mcp-tools', name);
  const venvDir = join(rootDir, '.venv');
  const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const executable =
    process.platform === 'win32'
      ? `${spec.executableName}.exe`
      : spec.executableName;

  return {
    rootDir,
    venvDir,
    pythonPath: join(venvDir, binDir, process.platform === 'win32' ? 'python.exe' : 'python'),
    executablePath: join(venvDir, binDir, executable),
  };
}

function runBuffered(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    child.on('error', (error) => {
      resolve({ ok: false, output: error.message });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        output: Buffer.concat(chunks).toString('utf-8').trim(),
      });
    });
  });
}

function runInherited(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => {
      reject(
        new Error(
          formatCliError({
            code: ErrorCode.CLIENT_ERROR,
            type: 'PYTHON_RUNTIME_COMMAND_FAILED',
            message: `Failed to run command: ${command}`,
            details: error.message,
            suggestion: 'Install uv first, then rerun the command.',
          }),
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          formatCliError({
            code: ErrorCode.CLIENT_ERROR,
            type: 'PYTHON_RUNTIME_COMMAND_FAILED',
            message: `Command failed with exit code ${code ?? 'unknown'}`,
            details: `${command} ${args.join(' ')}`,
            suggestion: 'Fix the setup error above, then rerun the install command.',
          }),
        ),
      );
    });
  });
}

export async function printPythonRuntimeDoctor(
  name: string,
  spec: PythonRuntimeSpec,
): Promise<void> {
  const paths = getPythonRuntimePaths(name, spec);
  const uv = await runBuffered('uv', ['--version']);
  const python = uv.ok
    ? await runBuffered('uv', ['python', 'find', spec.pythonVersion])
    : { ok: false, output: 'skipped because uv is missing' };

  console.log(`${name}`);
  console.log(`  uv: ${uv.ok ? uv.output || 'ok' : `missing (${uv.output})`}`);
  console.log(
    `  python ${spec.pythonVersion}: ${python.ok ? python.output || 'ok' : `missing (${python.output})`}`,
  );
  console.log(`  runtime: ${paths.rootDir}`);
  console.log(`  venv: ${existsSync(paths.venvDir) ? 'present' : 'missing'}`);
  console.log(`  executable: ${existsSync(paths.executablePath) ? paths.executablePath : 'missing'}`);

  if (!uv.ok) {
    console.log('');
    console.log('Install uv first:');
    console.log('  macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh');
    console.log('  Windows PowerShell: irm https://astral.sh/uv/install.ps1 | iex');
  }

  if (uv.ok && !python.ok) {
    console.log('');
    console.log(`Install Python ${spec.pythonVersion}+ first:`);
    console.log('  Ubuntu/Debian: sudo apt update && sudo apt install -y python3 python3-venv');
    console.log('  macOS: brew install python');
    console.log('  Windows PowerShell: winget install Python.Python.3.12');
    console.log('');
    console.log('Then rerun:');
    console.log(`  pibo mcp registry doctor ${name}`);
  }
}

export async function installPythonRuntime(
  name: string,
  spec: PythonRuntimeSpec,
): Promise<PythonRuntimePaths> {
  const uv = await runBuffered('uv', ['--version']);
  if (!uv.ok) {
    throw new Error(
      formatCliError({
        code: ErrorCode.CLIENT_ERROR,
        type: 'PYTHON_RUNTIME_UV_MISSING',
        message: 'uv was not found on PATH',
        details: uv.output,
        suggestion:
          'Install uv first. macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh. Windows PowerShell: irm https://astral.sh/uv/install.ps1 | iex.',
      }),
    );
  }

  const paths = getPythonRuntimePaths(name, spec);
  await mkdir(paths.rootDir, { recursive: true });

  await runInherited('uv', ['venv', paths.venvDir, '--python', spec.pythonVersion]);
  await runInherited('uv', [
    'pip',
    'install',
    '--python',
    paths.pythonPath,
    spec.packageName,
  ]);

  if (spec.postInstallArgs?.length) {
    await runInherited(paths.executablePath, spec.postInstallArgs);
  }

  return paths;
}

export async function removePythonRuntime(
  name: string,
  spec: PythonRuntimeSpec,
): Promise<void> {
  const paths = getPythonRuntimePaths(name, spec);
  await rm(paths.rootDir, { recursive: true, force: true });
  console.log(`Removed runtime: ${paths.rootDir}`);
}
