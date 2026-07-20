#!/usr/bin/env node
'use strict';

/**
 * Builds the standard release, then adds a separate opt-in secure LAN
 * executable, certificate setup script, launcher, and documentation.
 * The default executable remains localhost-only.
 */

const { execFileSync, execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT = __dirname;
const RELEASE_DIR = path.join(ROOT, 'release');
const RELEASE = path.join(RELEASE_DIR, 'ASAdventurer');
const LAN_EXE = path.join(RELEASE, 'ASAdventurerLAN.exe');
const ZIP_PATH = path.join(RELEASE_DIR, 'ASAdventurer.zip');

function log(message) {
  console.log(`  ${message}`);
}

function buildLanExecutable() {
  const icon = path.join(ROOT, 'icon.ico');
  const command = [
    'npx --yes pkg',
    `"${path.join(ROOT, 'lan-global-server.js')}"`,
    '--targets node18-win-x64',
    '--output', `"${LAN_EXE}"`,
    '--compress GZip',
    fs.existsSync(icon) ? `--icon "${icon}"` : ''
  ].filter(Boolean).join(' ');

  log('Compiling secure LAN launcher -> ASAdventurerLAN.exe ...');
  execSync(command, { stdio: 'inherit', cwd: ROOT });
}

function copyLanSupportFiles() {
  const setupScript = path.join(ROOT, 'setup-lan-certificate.ps1');
  if (!fs.existsSync(setupScript)) {
    throw new Error('setup-lan-certificate.ps1 is missing');
  }
  fs.copyFileSync(setupScript, path.join(RELEASE, 'setup-lan-certificate.ps1'));
}

function writeLanLauncher() {
  fs.writeFileSync(path.join(RELEASE, 'Start AS Adventurer LAN.bat'),
`@echo off
echo.
echo  ============================================
echo   AS Adventurer - Secure LAN Mode
echo  ============================================
echo.
echo  This mode is visible to other devices on your
echo  trusted home/private network.
echo.
echo  On first launch, Windows creates a local HTTPS
echo  certificate so remote camera and microphone access works.
echo.
echo  Each computer registers its own machine token and receives
echo  an isolated private asset folder under machine-data.
echo.
echo  Models in public\assets are shared read-only global models.
echo.
echo  Use one of the HTTPS URLs printed below.
echo  Press Ctrl+C to stop the server.
echo.
cd /d "%~dp0"
ASAdventurerLAN.exe
pause
`);
}

function addLanDocumentation() {
  for (const fileName of ['LAN_SETUP.md', 'AI_ACTOR_MVP.md', 'AI_ACTOR_CONTROL_PANEL.md']) {
    const sourceGuide = path.join(ROOT, fileName);
    if (fs.existsSync(sourceGuide)) {
      fs.copyFileSync(sourceGuide, path.join(RELEASE, fileName));
    }
  }

  const readmePath = path.join(RELEASE, 'README.md');
  const marker = '## Running on another computer';
  let readme = fs.readFileSync(readmePath, 'utf8');
  if (!readme.includes(marker)) {
    readme += `\n\n${marker}\n\nFor a second computer on the same trusted private network, double-click\n\`Start AS Adventurer LAN.bat\`. The first launch creates a private HTTPS\ncertificate. Copy the generated \`lan-cert\` folder to the second computer and\nrun its certificate installer once. Open the secure Control Panel, register that\ncomputer to create its token, upload its private model folder, and copy the\nauthenticated OBS URL. Models under \`public/assets\` are available to all\nregistered machines as read-only global models. See \`LAN_SETUP.md\` for full steps.\n\nAI Actors can drive dedicated OBS models from Streamer.bot. See\n\`AI_ACTOR_MVP.md\` for API setup and \`AI_ACTOR_CONTROL_PANEL.md\` for actor\ncreation, testing, model selection, credential regeneration, and deletion.\n`;
    fs.writeFileSync(readmePath, readme);
  }
}

function writeLanChecksum() {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(LAN_EXE)).digest('hex');
  fs.writeFileSync(path.join(RELEASE, 'CHECKSUM-LAN.txt'),
`SHA256 Checksum for ASAdventurerLAN.exe
========================================

${hash}

To verify on Windows, open PowerShell and run:
  Get-FileHash ASAdventurerLAN.exe -Algorithm SHA256
`);
  log(`LAN SHA256: ${hash}`);
}

function createZip() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);

    const output = fs.createWriteStream(ZIP_PATH);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(RELEASE, 'ASAdventurer');
    archive.finalize();
  });
}

async function main() {
  console.log('');
  console.log('  Building standard release first...');
  execFileSync(process.execPath, [path.join(ROOT, 'build-release.js')], {
    stdio: 'inherit',
    cwd: ROOT
  });

  buildLanExecutable();
  copyLanSupportFiles();
  writeLanLauncher();
  addLanDocumentation();
  writeLanChecksum();

  log('Rebuilding release ZIP with secure LAN files...');
  await createZip();
  const zipMB = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1);

  console.log('');
  log('Secure LAN-enabled release complete.');
  log(`Archive: release/ASAdventurer.zip (${zipMB} MB)`);
  log('Default launcher remains localhost-only.');
  console.log('');
}

main().catch(error => {
  console.error('\n  LAN release build failed:', error.message);
  process.exitCode = 1;
});
