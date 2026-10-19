#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, '..');
const iosDir = path.join(repoDir, 'ios');
const serviceDir = path.resolve(process.env.MEDIEVAL_GAME_SERVICE_DIR ?? path.join(repoDir, 'game-service'));
const distDir = path.join(repoDir, 'dist');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const stagingRoot = path.join(os.tmpdir(), `medieval-release-${process.pid}-${stamp}`);

const commonExcludedNames = new Set([
  '.DS_Store',
  '.codex-tmp',
  '.env',
  '.git',
  '.build',
  '.swiftpm',
  'DerivedData',
  '.runtime',
  '.next',
  'coverage',
  'build',
  'dist',
  'node_modules',
]);

function shouldExclude(name) {
  if (commonExcludedNames.has(name)) return true;
  if (name.startsWith('.env.') && name !== '.env.example') return true;
  if (name.endsWith('.xcuserstate')) return true;
  if (name.endsWith('.xcscmblueprint')) return true;
  if (name.endsWith('.moved-aside')) return true;
  if (name.startsWith('npm-debug.log')) return true;
  return false;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyClean(source, destination) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    if (shouldExclude(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'xcuserdata') continue;
      await copyClean(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFilePreservingMode(sourcePath, destinationPath);
    }
  }
}

async function copyFilePreservingMode(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  const stats = await fs.stat(sourcePath);
  await fs.chmod(destinationPath, stats.mode);
}

function zipDirectory(sourceDir, outputPath) {
  const result = spawnSync('zip', ['-qr', outputPath, '.'], {
    cwd: sourceDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`zip failed for ${outputPath}`);
  }
}

async function bundleProject({ name, sourceDir }) {
  if (!(await exists(sourceDir))) return null;
  const stageDir = path.join(stagingRoot, name);
  const outputPath = path.join(distDir, `${name}-${stamp}.zip`);
  await copyClean(sourceDir, stageDir);
  zipDirectory(stageDir, outputPath);
  return outputPath;
}

async function bundleIOSApp() {
  if (!(await exists(path.join(iosDir, 'ListingEvalApp.xcodeproj')))) return null;
  const stageDir = path.join(stagingRoot, 'MediEval-iOS');
  const outputPath = path.join(distDir, `MediEval-iOS-${stamp}.zip`);

  await copyClean(iosDir, stageDir);
  await copyClean(path.join(repoDir, 'scripts'), path.join(stageDir, 'scripts'));
  for (const directory of ['docs', 'examples', 'packages', 'services']) {
    await copyClean(path.join(repoDir, directory), path.join(stageDir, directory));
  }
  for (const name of ['package.json', 'package-lock.json', 'README.md', 'llms.txt', 'LICENSE', 'NOTICE', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'ROADMAP.md']) {
    await copyFilePreservingMode(path.join(repoDir, name), path.join(stageDir, name));
  }
  const logo = 'Art/Generated/Logo/medieval-logo-transparent-v1.png';
  await copyFilePreservingMode(path.join(iosDir, logo), path.join(stageDir, 'ios', logo));
  await copyFilePreservingMode(path.join(iosDir, 'README.md'), path.join(stageDir, 'ios', 'README.md'));
  await copyFilePreservingMode(path.join(repoDir, 'game-service', 'README.md'), path.join(stageDir, 'game-service', 'README.md'));
  await copyClean(path.join(repoDir, 'game-service', 'docs'), path.join(stageDir, 'game-service', 'docs'));
  await copyFilePreservingMode(path.join(repoDir, 'docs', 'maintainers', 'HANDOFF.md'), path.join(stageDir, 'HANDOFF.md'));
  await copyFilePreservingMode(path.join(repoDir, 'docs', 'maintainers', 'VERIFY.md'), path.join(stageDir, 'VERIFY.md'));
  await copyClean(path.join(repoDir, '.github'), path.join(stageDir, '.github'));

  zipDirectory(stageDir, outputPath);
  return outputPath;
}

await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

try {
  const outputs = [];
  outputs.push(await bundleIOSApp());
  outputs.push(await bundleProject({ name: 'MediEvalGameService', sourceDir: serviceDir }));

  const bundled = outputs.filter(Boolean);
  if (bundled.length === 0) {
    throw new Error('No bundle outputs were created.');
  }

  console.log(JSON.stringify({
    ok: true,
    distDir,
    bundles: bundled,
  }, null, 2));
} finally {
  await fs.rm(stagingRoot, { recursive: true, force: true });
}
