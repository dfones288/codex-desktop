import { spawn } from 'node:child_process';
import process from 'node:process';
import { buildPackageCommand } from './packageConfig.mjs';

const validPlatforms = new Set(['current', 'mac', 'win']);
const platform = readPlatform(process.argv.slice(2));
const command = buildPackageCommand(platform, process.env);
const childEnv = buildChildEnv(platform, process.env);

for (const note of command.signingNotes) {
  console.warn(`[package] ${note}`);
}

console.log(`[package] Running: npx ${command.args.join(' ')}`);

const child = spawn('npx', command.args, {
  env: childEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[package] electron-builder exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

function readPlatform(args) {
  const platformArg = args.find((arg) => arg.startsWith('--platform='));
  const platformValue = platformArg ? platformArg.slice('--platform='.length) : 'current';

  if (!validPlatforms.has(platformValue)) {
    console.error(`[package] Invalid platform "${platformValue}". Use current, mac, or win.`);
    process.exit(1);
  }

  return platformValue;
}

function buildChildEnv(platform, env) {
  const childEnv = { ...env };
  const hasMacSigning = Boolean(env.CSC_LINK || env.CSC_NAME);
  const hasWindowsSigning = Boolean(env.WIN_CSC_LINK || env.CSC_LINK || env.WIN_CSC_NAME || env.CSC_NAME);

  if ((platform === 'mac' || platform === 'current') && !hasMacSigning) {
    childEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  if ((platform === 'win' || platform === 'current') && !hasWindowsSigning) {
    childEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  return childEnv;
}
