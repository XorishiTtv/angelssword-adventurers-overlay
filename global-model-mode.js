'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ASSET_EXTENSIONS = ['.webm', '.webp', '.gif', '.png', '.mp4'];
const SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const STATE_NAMES = [
  'neutral_idle', 'neutral_speaking',
  'happy_idle', 'happy_speaking',
  'sad_idle', 'sad_speaking',
  'surprised_idle', 'surprised_speaking',
  'typing', 'eyes_closed'
];
const GLOBAL_PREFIX = 'global:';
const PRIVATE_PREFIX = 'private:';
const WATCH_DEBOUNCE_MS = 500;

let installed = false;

function installGlobalModelMode(options = {}) {
  if (installed) return;
  installed = true;
  const appDir = options.appDir || (process.pkg ? path.dirname(process.execPath) : __dirname);
  const dataDir = path.join(appDir, 'machine-data');
  const registryPath = path.join(dataDir, 'registry.json');
  const selectionsPath = path.join(dataDir, 'global-selections.json');
  const globalAssetsDir = path.join(appDir, 'public', 'assets');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(globalAssetsDir, { recursive: true });

  let selections = loadSelections();
  let manifestCache = null;
  let manifestRevision = 0;
  let watcherTimer = null;
  const machineClients = new Map();
  const activeEmotes = new Map();

  function loadSelections() {
    try {
      const parsed = JSON.parse(fs.readFileSync(selectionsPath, 'utf8'));
      if (parsed && parsed.version === 1 && parsed.selections && typeof parsed.selections === 'object') {
        return parsed;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[global-models] Could not read selections:', error.message);
    }
    return { version: 1, selections: {} };
  }

  function saveSelections() {
    const tempPath = `${selectionsPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(selections, null, 2), { mode: 0o600 });
    fs.rmSync(selectionsPath, { force: true });
    fs.renameSync(tempPath, selectionsPath);
  }

  function readRegistry() {
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      return parsed && Array.isArray(parsed.machines) ? parsed.machines : [];
    } catch {
      return [];
    }
  }

  function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  function tokenMatches(machine, token) {
    if (!machine || !token || typeof machine.tokenHash !== 'string') return false;
    const candidate = Buffer.from(hashToken(token), 'hex');
    const expected = Buffer.from(machine.tokenHash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  function extractToken(req) {
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const queryToken = requestUrl.searchParams.get('machine_token');
      if (queryToken) return queryToken;
    } catch { /* ignore malformed URL */ }

    const headerToken = req.headers?.['x-machine-token'];
    if (typeof headerToken === 'string' && headerToken) return headerToken;
    const authorization = req.headers?.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : '';
  }

  function findMachineByToken(token) {
    if (!token) return null;
    return readRegistry().find(machine => tokenMatches(machine, token)) || null;
  }

  function authenticateRequest(req, res) {
    const machine = findMachineByToken(extractToken(req));
    if (!machine) {
      res.status(401).json({ error: 'machine registration token required', code: 'MACHINE_TOKEN_REQUIRED' });
      return null;
    }
    return machine;
  }

  function globalId(name) {
    return `${GLOBAL_PREFIX}${name}`;
  }

  function privateId(name) {
    return `${PRIVATE_PREFIX}${name || 'Default'}`;
  }

  function encodeRelativePath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
  }

  function globalAssetUrl(relativePath) {
    return `/assets/${encodeRelativePath(relativePath)}`;
  }

  function findExistingFile(directory, baseName, extensions) {
    for (const extension of extensions) {
      const filePath = path.join(directory, `${baseName}${extension}`);
      try {
        if (fs.statSync(filePath).isFile()) return `${baseName}${extension}`;
      } catch { /* continue */ }
    }
    return null;
  }

  function scanModelAssets(modelDirectory, modelRelative) {
    const assets = {};
    for (const state of STATE_NAMES) {
      const fileName = findExistingFile(modelDirectory, state, ASSET_EXTENSIONS);
      if (!fileName) continue;
      const relative = modelRelative ? `${modelRelative}/${fileName}` : fileName;
      assets[state] = globalAssetUrl(relative);
    }
    return assets;
  }

  function scanVariants(directory, baseNames, extensions, makeUrl, maxVariants = 20) {
    const variants = [];
    let activeBase = null;
    for (const baseName of baseNames) {
      const found = findExistingFile(directory, baseName, extensions);
      if (!found) continue;
      activeBase = baseName;
      variants.push(makeUrl(found));
      break;
    }
    if (!activeBase) return variants;
    for (let index = 2; index <= maxVariants; index++) {
      const found = findExistingFile(directory, `${activeBase}${index}`, extensions);
      if (!found) break;
      variants.push(makeUrl(found));
    }
    return variants;
  }

  function scanSoundVariants(directory, baseNames, extensions, makeUrl, maxVariants = 20) {
    const variants = [];
    let activeBase = null;
    for (const baseName of baseNames) {
      const found = findExistingFile(directory, baseName, extensions);
      if (!found) continue;
      activeBase = baseName;
      variants.push(makeUrl(found));
      break;
    }
    if (!activeBase) return variants;
    const parts = activeBase.split('_');
    for (let index = 2; index <= maxVariants; index++) {
      const first = findExistingFile(directory, `${activeBase}${index}`, extensions);
      const alternateName = parts.length >= 2 ? `${parts[0]}${index}_${parts.slice(1).join('_')}` : null;
      const second = alternateName ? findExistingFile(directory, alternateName, extensions) : null;
      const found = first || second;
      if (!found) break;
      variants.push(makeUrl(found));
    }
    return variants;
  }

  function scanSubs(parentDir, parentRelative, depth = 0) {
    if (depth >= 5) return [];
    const subsDir = path.join(parentDir, 'subs');
    if (!fs.existsSync(subsDir)) return [];
    const result = [];

    let entries = [];
    try {
      entries = fs.readdirSync(subsDir, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const subDir = path.join(subsDir, entry.name);
      const subRelative = `${parentRelative}/subs/${entry.name}`;
      const makeUrl = fileName => globalAssetUrl(`${subRelative}/${fileName}`);
      const files = {};

      const idle = findExistingFile(subDir, 'idle', ASSET_EXTENSIONS);
      if (idle) files.idle = makeUrl(idle);
      for (const speakingName of ['speaking', 'idle_speaking']) {
        const speaking = findExistingFile(subDir, speakingName, ASSET_EXTENSIONS);
        if (speaking) { files.speaking = makeUrl(speaking); break; }
      }

      const animations = scanVariants(subDir, ['animation', 'intro'], ASSET_EXTENSIONS, makeUrl);
      if (animations.length) {
        files.animation = animations[0];
        if (animations.length > 1) files.animation_variants = animations;
      }
      const outros = scanVariants(subDir, ['outro'], ASSET_EXTENSIONS, makeUrl);
      if (outros.length) {
        files.outro = outros[0];
        if (outros.length > 1) files.outro_variants = outros;
      }
      const sounds = scanSoundVariants(subDir, ['intro_sound', 'sound'], SOUND_EXTENSIONS, makeUrl);
      if (sounds.length) {
        files.sound = sounds[0];
        if (sounds.length > 1) files.sound_variants = sounds;
      }
      const outroSounds = scanSoundVariants(subDir, ['outro_sound'], SOUND_EXTENSIONS, makeUrl);
      if (outroSounds.length) {
        files.outro_sound = outroSounds[0];
        if (outroSounds.length > 1) files.outro_sound_variants = outroSounds;
      }
      const idleSound = findExistingFile(subDir, 'idle_sound', SOUND_EXTENSIONS);
      if (idleSound) files.idle_sound = makeUrl(idleSound);

      if (files.animation || files.idle) {
        result.push({
          name: entry.name,
          files,
          subs: scanSubs(subDir, subRelative, depth + 1)
        });
      }
    }
    return result;
  }

  function scanEmotes(modelDirectory, modelRelative) {
    const emotesDirectory = path.join(modelDirectory, 'emotes');
    if (!fs.existsSync(emotesDirectory)) return [];
    const emotes = [];

    let entries = [];
    try {
      entries = fs.readdirSync(emotesDirectory, { withFileTypes: true });
    } catch {
      return emotes;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const emoteDir = path.join(emotesDirectory, entry.name);
      const emoteRelative = modelRelative
        ? `${modelRelative}/emotes/${entry.name}`
        : `emotes/${entry.name}`;
      const makeUrl = fileName => globalAssetUrl(`${emoteRelative}/${fileName}`);
      const files = {};

      for (const baseName of ['animation', 'intro', 'idle', 'speaking', 'outro']) {
        const found = findExistingFile(emoteDir, baseName, ASSET_EXTENSIONS);
        if (found) files[baseName] = makeUrl(found);
      }

      const introVariants = scanVariants(emoteDir, ['intro'], ASSET_EXTENSIONS, makeUrl);
      if (introVariants.length > 1) files.intro_variants = introVariants;
      const outroVariants = scanVariants(emoteDir, ['outro'], ASSET_EXTENSIONS, makeUrl);
      if (outroVariants.length > 1) files.outro_variants = outroVariants;

      for (const soundBase of ['intro_sound', 'outro_sound', 'animation_sound']) {
        const found = findExistingFile(emoteDir, soundBase, SOUND_EXTENSIONS);
        if (found) files[soundBase] = makeUrl(found);
        const variants = scanSoundVariants(emoteDir, [soundBase], SOUND_EXTENSIONS, makeUrl);
        if (variants.length > 1) files[`${soundBase}_variants`] = variants;
      }
      const idleSound = findExistingFile(emoteDir, 'idle_sound', SOUND_EXTENSIONS);
      if (idleSound) files.idle_sound = makeUrl(idleSound);

      const emoteType = files.animation ? 1 : (files.idle ? 2 : null);
      if (emoteType !== null) {
        emotes.push({
          name: entry.name,
          emoteType,
          files,
          subs: scanSubs(emoteDir, emoteRelative)
        });
      }
    }
    return emotes;
  }

  function buildManifest() {
    const models = [];
    const modelData = {};

    const addModel = (displayName, directory, relative) => {
      const assets = scanModelAssets(directory, relative);
      const assetCount = Object.keys(assets).length;
      if (!assetCount) return;
      const id = globalId(displayName);
      models.push({ name: id, displayName, scope: 'global', assetCount });
      modelData[id] = { assets, emotes: scanEmotes(directory, relative) };
    };

    addModel('Default', globalAssetsDir, '');
    let entries = [];
    try {
      entries = fs.readdirSync(globalAssetsDir, { withFileTypes: true });
    } catch { /* empty manifest */ }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && entry.name !== 'Default') {
        addModel(entry.name, path.join(globalAssetsDir, entry.name), entry.name);
      }
    }

    return { revision: manifestRevision, models, modelData };
  }

  function getManifest() {
    if (!manifestCache) manifestCache = buildManifest();
    return manifestCache;
  }

  function selectedGlobalModel(machineId, manifest = getManifest()) {
    const selected = selections.selections[machineId];
    if (selected && manifest.modelData[selected]) return selected;
    if (selected) {
      delete selections.selections[machineId];
      saveSelections();
    }
    return null;
  }

  function broadcastMachine(machineId, data) {
    const clients = machineClients.get(machineId);
    if (!clients) return;
    const payload = JSON.stringify(data);
    for (const socket of clients) {
      if (socket.readyState !== 1) continue;
      const send = socket._asNativeSend || socket.send?.bind(socket);
      if (send) send(payload);
    }
  }

  function broadcastAll(data) {
    for (const machineId of machineClients.keys()) broadcastMachine(machineId, data);
  }

  function privateFallback(machineId) {
    const machine = readRegistry().find(item => item.id === machineId);
    return privateId(machine?.activeModel || 'Default');
  }

  function publishGlobalChange(reason) {
    const manifest = getManifest();
    let selectionsChanged = false;

    for (const [machineId, selected] of Object.entries(selections.selections)) {
      if (manifest.modelData[selected]) {
        activeEmotes.delete(machineId);
        broadcastMachine(machineId, {
          type: 'model_change',
          model: selected,
          reason: 'global_assets_changed',
          globalRevision: manifest.revision
        });
      } else {
        delete selections.selections[machineId];
        selectionsChanged = true;
        activeEmotes.delete(machineId);
        broadcastMachine(machineId, {
          type: 'model_change',
          model: privateFallback(machineId),
          reason: 'global_model_removed',
          globalRevision: manifest.revision
        });
      }
    }

    if (selectionsChanged) saveSelections();
    broadcastAll({ type: 'global_assets_changed', reason, globalRevision: manifest.revision });
  }

  function invalidateGlobalManifest(reason = 'filesystem') {
    manifestCache = null;
    manifestRevision += 1;
    clearTimeout(watcherTimer);
    watcherTimer = setTimeout(() => {
      watcherTimer = null;
      try {
        publishGlobalChange(reason);
      } catch (error) {
        console.warn('[global-models] Could not publish asset change:', error.message);
      }
    }, WATCH_DEBOUNCE_MS);
    watcherTimer.unref?.();
  }

  function installRoutes(app) {
    app.get('/api/global/models', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const manifest = getManifest();
      const active = selectedGlobalModel(machine.id, manifest);
      return res.json({ models: manifest.models, active, revision: manifest.revision });
    });

    app.get('/api/global/assets', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const manifest = getManifest();
      const requested = String(req.query.model || selectedGlobalModel(machine.id, manifest) || '');
      const model = manifest.modelData[requested];
      return res.json(model?.assets || {});
    });

    app.post('/api/global/models/select', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const model = String(req.body?.model || '');
      const manifest = getManifest();
      if (!manifest.modelData[model]) return res.status(404).json({ error: 'global model not found' });
      selections.selections[machine.id] = model;
      saveSelections();
      activeEmotes.delete(machine.id);
      broadcastMachine(machine.id, { type: 'model_change', model, globalRevision: manifest.revision });
      return res.json({ success: true, active: model });
    });

    app.delete('/api/global/models/select', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      if (selections.selections[machine.id]) {
        delete selections.selections[machine.id];
        saveSelections();
      }
      activeEmotes.delete(machine.id);
      return res.json({ success: true, active: null });
    });

    app.get('/api/global/emotes', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const manifest = getManifest();
      const active = selectedGlobalModel(machine.id, manifest);
      return res.json(active ? (manifest.modelData[active]?.emotes || []) : []);
    });

    app.post('/api/global/emote/trigger', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const manifest = getManifest();
      const active = selectedGlobalModel(machine.id, manifest);
      const emote = (active ? manifest.modelData[active]?.emotes : [])?.find(item => item.name === req.body?.name);
      if (!emote) return res.status(404).json({ error: 'global emote not found' });
      activeEmotes.set(machine.id, emote);
      broadcastMachine(machine.id, { type: 'emote', action: 'trigger', name: emote.name, emote });
      return res.json({ success: true, emote });
    });

    app.post('/api/global/emote/release', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      activeEmotes.delete(machine.id);
      broadcastMachine(machine.id, { type: 'emote', action: 'release' });
      return res.json({ success: true });
    });

    app.post('/api/global/emote/sub', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const activeEmote = activeEmotes.get(machine.id);
      if (!activeEmote) return res.status(400).json({ error: 'no global emote is active' });
      const parts = String(req.body?.name || '').split('/').filter(Boolean);
      let currentSubs = activeEmote.subs || [];
      let sub = null;
      for (const part of parts) {
        sub = currentSubs.find(item => item.name === part);
        if (!sub) return res.status(404).json({ error: `sub-animation '${part}' not found` });
        currentSubs = sub.subs || [];
      }
      if (!sub) return res.status(400).json({ error: 'sub-animation name required' });
      broadcastMachine(machine.id, { type: 'emote', action: 'sub', sub, parentEmote: activeEmote.name });
      return res.json({ success: true, sub });
    });
  }

  const currentExpressFactory = require('express');
  function globalExpressFactory(...args) {
    const app = currentExpressFactory(...args);
    installRoutes(app);
    return app;
  }
  Object.assign(globalExpressFactory, currentExpressFactory);
  globalExpressFactory.application = currentExpressFactory.application;
  globalExpressFactory.request = currentExpressFactory.request;
  globalExpressFactory.response = currentExpressFactory.response;
  require.cache[require.resolve('express')].exports = globalExpressFactory;

  function attachSocket(socket, machine) {
    let clients = machineClients.get(machine.id);
    if (!clients) {
      clients = new Set();
      machineClients.set(machine.id, clients);
    }
    clients.add(socket);
    socket.once('close', () => {
      clients.delete(socket);
      if (clients.size === 0) machineClients.delete(machine.id);
    });
  }

  const nativeWsOn = WebSocketServer.prototype.on;
  WebSocketServer.prototype.on = function globalModelWebSocketOn(event, listener) {
    if (event !== 'connection') return nativeWsOn.call(this, event, listener);
    return nativeWsOn.call(this, event, function globalModelConnection(socket, request) {
      const machine = findMachineByToken(extractToken(request));
      if (machine) attachSocket(socket, machine);
      return listener.call(this, socket, request);
    });
  };

  try {
    const options = process.platform === 'win32' || process.platform === 'darwin'
      ? { recursive: true }
      : {};
    const watcher = fs.watch(globalAssetsDir, options, () => invalidateGlobalManifest('filesystem'));
    watcher.on('error', error => console.warn('[global-models] Asset watcher failed:', error.message));
  } catch (error) {
    console.warn('[global-models] Could not watch public assets:', error.message);
  }

  console.log('  Global models enabled from public/assets (read-only for LAN clients).');
}

module.exports = { installGlobalModelMode };
