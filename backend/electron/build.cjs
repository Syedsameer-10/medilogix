const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const electronRoot = __dirname;
const appRoot = path.join(electronRoot, '..', '..');
const frontendRoot = path.join(appRoot, 'frontend');
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
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
