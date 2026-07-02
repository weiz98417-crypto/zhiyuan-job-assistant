#!/usr/bin/env node
// @ts-check

import { spawnSync } from 'child_process';
import os from 'os';

const isLinux = os.platform() === 'linux';
const npmRunner = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
const args = ['playwright', 'install', ...(isLinux ? ['--with-deps'] : []), 'chromium'];

console.log(`[playwright] Installing Chromium${isLinux ? ' with Linux system dependencies' : ''}...`);
const result = spawnSync(npmRunner, args, {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`[playwright] Failed to start installer: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[playwright] Installer exited with status ${result.status}.`);
  if (isLinux) {
    console.error('[playwright] On Aliyun/ECS, run this command with a user that can install apt/yum dependencies, or install OS libraries from Playwright docs first.');
  }
  process.exit(result.status || 1);
}

console.log('[playwright] Chromium is ready.');
