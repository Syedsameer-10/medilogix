const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const electronRoot = __dirname;
const appRoot = path.join(electronRoot, '..', '..');
const frontendRoot = path.join(appRoot, 'frontend');
const backendRoot = path.join(appRoot, 'backend');
const execFileAsync = promisify(execFile);

async function build() {
  const distDir = path.join(electronRoot, 'dist');
  const stagedElectronDir = path.join(frontendRoot, 'electron');
  const tscBin = path.join(frontendRoot, 'node_modules', 'typescript', 'bin', 'tsc');

  await fs.mkdir(distDir, { recursive: true });
  await execFileAsync(process.execPath, [tscBin, '-p', path.join(electronRoot, 'tsconfig.build.json')], {
    cwd: electronRoot,
    windowsHide: true,
  });
  await fs.copyFile(path.join(electronRoot, 'preload.cjs'), path.join(distDir, 'preload.cjs'));
  await fs.rm(stagedElectronDir, { force: true, recursive: true });
  await fs.mkdir(stagedElectronDir, { recursive: true });
  await fs.copyFile(path.join(electronRoot, 'main.cjs'), path.join(stagedElectronDir, 'main.cjs'));
  await fs.cp(distDir, path.join(stagedElectronDir, 'dist'), { recursive: true });
  await fs.writeFile(
    path.join(stagedElectronDir, 'config.json'),
    JSON.stringify({ deployedFrontendUrl: await getDeployedFrontendUrl() }, null, 2),
  );
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function getDeployedFrontendUrl() {
  const backendEnv = await readEnvFile(path.join(backendRoot, '.env'));
  const frontendUrl = backendEnv.MEDILOGIX_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).find(Boolean);

  if (!frontendUrl) {
    throw new Error('MEDILOGIX_ALLOWED_ORIGINS must include the deployed frontend URL for packaged Electron builds');
  }

  return frontendUrl.replace(/\/$/, '');
}

async function readEnvFile(filePath) {
  const result = {};
  const contents = await fs.readFile(filePath, 'utf8');

  contents.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key) {
      result[key] = value;
    }
  });

  return result;
}
