#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(__dirname, '..');

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const appDir = await exists(path.join(repoDir, 'ios', 'ListingEvalApp.xcodeproj'))
  ? path.join(repoDir, 'ios')
  : repoDir;
const sourceDir = path.join(appDir, 'ListingEvalApp');
const projectPath = path.join(appDir, 'ListingEvalApp.xcodeproj/project.pbxproj');
const schemePath = path.join(appDir, 'ListingEvalApp.xcodeproj/xcshareddata/xcschemes/ListingEvalApp.xcscheme');
const infoPlistPath = path.join(sourceDir, 'Info.plist');
const assetRoot = path.join(sourceDir, 'Assets.xcassets');
const apiClientPath = path.join(sourceDir, 'APIClient.swift');
const contentViewPath = path.join(sourceDir, 'ContentView.swift');
const ciWorkflowPath = path.join(repoDir, '.github/workflows/ci.yml');

async function readText(targetPath) {
  return fs.readFile(targetPath, 'utf8');
}

async function readJson(targetPath) {
  return JSON.parse(await readText(targetPath));
}

async function walkFiles(root, relativeBase = root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, relativeBase));
    } else if (entry.isFile()) {
      files.push(path.relative(relativeBase, fullPath));
    }
  }
  return files;
}

function assertIncludes(text, expected, label) {
  assert.ok(text.includes(expected), `${label} must include ${expected}`);
}

function assertDoesNotInclude(text, unexpected, label) {
  assert.ok(!text.includes(unexpected), `${label} must not include ${unexpected}`);
}

function commentsMatching(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

const [project, scheme, infoPlist, apiClient, contentView, ciWorkflow] = await Promise.all([
  readText(projectPath),
  readText(schemePath),
  readText(infoPlistPath),
  readText(apiClientPath),
  readText(contentViewPath),
  readText(ciWorkflowPath),
]);

const swiftFiles = (await walkFiles(sourceDir))
  .filter((file) => file.endsWith('.swift'))
  .sort();
const sourcePhase = project.match(/\/\* Begin PBXSourcesBuildPhase section \*\/([\s\S]*?)\/\* End PBXSourcesBuildPhase section \*\//)?.[1] ?? '';
assert.ok(sourcePhase, 'project.pbxproj must include a PBXSourcesBuildPhase section.');
const sourceComments = commentsMatching(sourcePhase, /\/\* ([^*]+\.swift) in Sources \*\//g).sort();
const sourceBasenames = new Set(sourceComments.map((file) => path.basename(file)));

for (const file of swiftFiles) {
  const basename = path.basename(file);
  assert.ok(sourceBasenames.has(basename), `${file} must be included in the Xcode Sources build phase.`);
  assertIncludes(project, `/* ${basename} */ = {isa = PBXFileReference`, 'project.pbxproj');
}

for (const sourceComment of sourceComments) {
  const basename = path.basename(sourceComment);
  assert.ok(
    swiftFiles.some((file) => path.basename(file) === basename),
    `${sourceComment} is referenced in Sources but no matching Swift file exists.`,
  );
}

assertIncludes(project, 'productType = "com.apple.product-type.application";', 'project.pbxproj');
assertIncludes(project, 'Assets.xcassets in Resources', 'project.pbxproj');
assertIncludes(project, 'INFOPLIST_FILE = ListingEvalApp/Info.plist;', 'project.pbxproj');
assertIncludes(project, 'GENERATE_INFOPLIST_FILE = NO;', 'project.pbxproj');
assertIncludes(project, 'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;', 'project.pbxproj');
assertIncludes(project, 'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;', 'project.pbxproj');
assertIncludes(project, 'SDKROOT = iphoneos;', 'project.pbxproj');
assertIncludes(project, 'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";', 'project.pbxproj');
assertIncludes(project, 'IPHONEOS_DEPLOYMENT_TARGET = 17.0;', 'project.pbxproj');
assertIncludes(project, 'SWIFT_VERSION = 5.0;', 'project.pbxproj');

assertIncludes(scheme, 'BuildableName = "ListingEvalApp.app"', 'shared scheme');
assertIncludes(scheme, 'BlueprintName = "ListingEvalApp"', 'shared scheme');
assertIncludes(scheme, 'ReferencedContainer = "container:ListingEvalApp.xcodeproj"', 'shared scheme');
assertIncludes(scheme, 'buildForRunning = "YES"', 'shared scheme');
assertIncludes(scheme, 'buildForArchiving = "YES"', 'shared scheme');

assertIncludes(infoPlist, '<string>MediEval</string>', 'Info.plist');
assertIncludes(infoPlist, '<key>NSLocalNetworkUsageDescription</key>', 'Info.plist');
assertIncludes(infoPlist, '<key>NSAllowsLocalNetworking</key>', 'Info.plist');
assertDoesNotInclude(infoPlist, '<key>NSAllowsArbitraryLoads</key>', 'Info.plist');

const assetContents = await readJson(path.join(assetRoot, 'Contents.json'));
assert.equal(assetContents.info?.author, 'xcode', 'Assets.xcassets/Contents.json must have Xcode asset metadata.');

const accentContents = await readJson(path.join(assetRoot, 'AccentColor.colorset/Contents.json'));
assert.ok(Array.isArray(accentContents.colors), 'AccentColor must define colors.');
assert.ok(accentContents.colors.length > 0, 'AccentColor must include at least one color.');

const appIconDir = path.join(assetRoot, 'AppIcon.appiconset');
const appIconContents = await readJson(path.join(appIconDir, 'Contents.json'));
assert.ok(Array.isArray(appIconContents.images), 'AppIcon must define images.');
const iconFiles = new Set((await fs.readdir(appIconDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name));
for (const image of appIconContents.images) {
  if (!image.filename) continue;
  assert.ok(iconFiles.has(image.filename), `AppIcon image ${image.filename} must exist.`);
}
assert.ok(
  appIconContents.images.some((image) => image.size === '1024x1024' && image.filename),
  'AppIcon must include a 1024x1024 marketing icon.',
);

const assetCatalogFiles = await walkFiles(assetRoot);
const contentsFiles = assetCatalogFiles.filter((file) => path.basename(file) === 'Contents.json');
assert.ok(contentsFiles.length > 0, 'Asset catalog must contain Contents.json files.');
for (const contentsFile of contentsFiles) {
  const contentsPath = path.join(assetRoot, contentsFile);
  const contents = await readJson(contentsPath);
  assert.equal(contents.info?.author, 'xcode', `${contentsFile} must have Xcode asset metadata.`);
  assert.equal(contents.info?.version, 1, `${contentsFile} must have Xcode asset metadata version.`);

  if (contentsFile.endsWith('.imageset/Contents.json')) {
    const imageDir = path.dirname(contentsPath);
    assert.ok(Array.isArray(contents.images), `${contentsFile} must define images.`);
    for (const image of contents.images) {
      if (!image.filename) continue;
      const imagePath = path.join(imageDir, image.filename);
      assert.ok(await exists(imagePath), `${contentsFile} references missing image ${image.filename}.`);
    }
  }
}

for (const expected of [
  'func mediEvalNormalizedBaseURL(from rawValue: String) -> URL?',
  'func mediEvalNormalizedBaseURLString(from rawValue: String) -> String?',
  'mediEvalLooksLocalHost',
  '192.168.',
  'candidate = "\\(scheme)://\\(candidate)"',
  '["http", "https"].contains(scheme)',
]) {
  assertIncludes(apiClient, expected, 'APIClient.swift URL normalization');
}

for (const expected of [
  'mediEvalNormalizedBaseURL(from: baseURLString)',
  'mediEvalNormalizedBaseURL(from: gameURLString)',
  'shouldAutoUseLocalDemoBackend',
  'normalizeDashboardURLIfPossible',
  'normalizeGameURLIfPossible',
  'dashboardSetupProblem',
  'guildSetupProblem',
  'settings.normalizeDashboardURLIfPossible()',
  'settings.normalizeGameURLIfPossible()',
  'guard let gameClient = settings.gameClient else',
  'gameOutbox.enqueue(gamePayload)',
  'until the backend is configured',
  'submittedCount = 0',
  'Image("MediEvalSirWrongalot")',
  'MediEvalShieldNay',
  'MediEvalShieldHmm',
  'MediEvalShieldAye',
]) {
  assertIncludes(contentView, expected, 'ContentView.swift setup flow');
}

for (const expected of [
  'runs-on: macos-15',
  'MEDIEVAL_RUN_XCODE_BUILD: "1"',
  'MEDIEVAL_RUN_XCODE_LAUNCH: "1"',
  'MEDIEVAL_SIMULATOR_USE_LOCAL_DEMO: "1"',
  'MEDIEVAL_SIMULATOR_SCREENSHOT:',
  'medieval-simulator-demo',
]) {
  assertIncludes(ciWorkflow, expected, '.github/workflows/ci.yml');
}

console.log(JSON.stringify({
  ok: true,
  checked: {
    swiftSources: swiftFiles,
    sourceBuildPhaseEntries: sourceComments,
    appIconImages: appIconContents.images.filter((image) => image.filename).length,
    setupFlow: 'URL normalization hooks present',
    ci: 'macOS simulator demo launch configured',
  },
}, null, 2));
