import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { detectDesktopEnv, hasDesktopDisplay, printLinuxVirtualDisplayHint } from './desktop-env.js';

export const PIBO_XVFB_SERVICE_NAME = 'pibo-xvfb.service';
export const PIBO_XVFB_SERVICE_PATH = `/etc/systemd/system/${PIBO_XVFB_SERVICE_NAME}`;

export function createPiboXvfbServiceUnit(): string {
  return [
    '[Unit]',
    'Description=Virtual X display for Pibo browser automation',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/bin/Xvfb :0 -screen 0 1920x1080x24 -ac -nolisten tcp',
    'Restart=always',
    'RestartSec=2',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

function isRootUser(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

async function waitForDisplaySocket(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync('/tmp/.X11-unix/X0')) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return existsSync('/tmp/.X11-unix/X0');
}

export async function ensureLinuxVirtualDisplay(options: {
  runInherited(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void>;
}): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  if (hasDesktopDisplay(detectDesktopEnv())) return false;

  if (!isRootUser()) {
    console.log('No desktop display detected and automatic virtual display setup requires root.');
    printLinuxVirtualDisplayHint('  ');
    return false;
  }

  console.log('No desktop display detected. Provisioning virtual X display for browser-use.');
  await options.runInherited('apt-get', ['update']);
  await options.runInherited('apt-get', ['install', '-y', 'xvfb', 'xauth', 'x11-xserver-utils']);
  await writeFile(PIBO_XVFB_SERVICE_PATH, createPiboXvfbServiceUnit(), 'utf8');
  await options.runInherited('systemctl', ['daemon-reload']);
  await options.runInherited('systemctl', ['enable', '--now', PIBO_XVFB_SERVICE_NAME]);

  process.env.DISPLAY = ':0';
  const ready = await waitForDisplaySocket();
  if (!ready) {
    throw new Error('Virtual X display service was installed but DISPLAY :0 did not become ready.');
  }

  console.log('Virtual X display ready on DISPLAY=:0');
  return true;
}
