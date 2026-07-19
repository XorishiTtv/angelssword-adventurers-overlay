'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_MACHINES = 50;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_PATH_LENGTH = 500;
const MAX_PATH_DEPTH = 12;
const ASSET_EXTENSIONS = ['.webm', '.webp', '.gif', '.png', '.mp4'];
const SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_EXTENSIONS = new Set([...ASSET_EXTENSIONS, ...SOUND_EXTENSIONS]);
const STATE_NAMES = [
  'neutral_idle', 'neutral_speaking',
  'happy_idle', 'happy_speaking',
  'sad_idle', 'sad_speaking',
  'surprised_idle', 'surprised_speaking',
  'typing', 'eyes_closed'
];

function installMachineMode({ expressModule, WebSocketServer, appDir }) {
  const DATA_DIR = path.join(appDir, 'machine-data');
  const REGISTRY_PATH = path.join(DATA_DIR, 'registry.json');
  const MACHINE_ASSETS_DIR = path.join(DATA_DIR, 'assets');
  const UPLOAD_TMP_DIR = path.join(DATA_DIR, 'tmp');
  fs.mkdirSync(MACHINE_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

  let registry = loadRegistry();
  const machineClients = new Map();
  const activeEmotes = new Map();
  let activeMachineContext = null;

  function loadRegistry() {
    try {
      const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      if (parsed && parsed.version === 1 && Array.isArray(parsed.machines)) return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[machine] Could not read registry:', error.message);
    }
    return { version: 1, machines: [] };
  }

  function saveRegistry() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tempPath = `${REGISTRY_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, REGISTRY_PATH);
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

  function findMachineByToken(token) {
    if (!token) return null;
    return registry.machines.find(machine => tokenMatches(machine, token)) || null;
  }

  function extractToken(req) {
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const queryToken = requestUrl.searchParams.get('machine_token');
      if (queryToken) return queryToken;
    } catch { /* ignore malformed URL */ }

    const headerToken = req.headers['x-machine-token'];
    if (typeof headerToken === 'string' && headerToken) return headerToken;

    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : '';
  }

  function authenticateRequest(req, res) {
    const token = extractToken(req);
    const machine = findMachineByToken(token);
    if (!machine) {
      res.status(401).json({ error: 'machine registration token required', code: 'MACHINE_TOKEN_REQUIRED' });
      return null;
    }
    machine.lastSeenAt = new Date().toISOString();
    req.machine = machine;
    req.machineToken = token;
    return machine;
  }

  function machineDir(machine) {
    return path.join(MACHINE_ASSETS_DIR, machine.id);
  }

  function sanitizeMachineName(value) {
    return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60);
  }

  function sanitizeRelativeAssetPath(value) {
    const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw || raw.length > MAX_PATH_LENGTH || raw.includes('\0')) return null;
    const parts = raw.split('/');
    if (parts.length > MAX_PATH_DEPTH || parts.some(part => !part || part === '.' || part === '..')) return null;
    if (parts.some(part => /[\u0000-\u001f\u007f:*?"<>|]/.test(part))) return null;
    const extension = path.extname(parts[parts.length - 1]).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) return null;
    return parts.join('/');
  }

  function resolveMachineAssetPath(machine, relativePath) {
    const safe = sanitizeRelativeAssetPath(relativePath);
    if (!safe) return null;
    const root = path.resolve(machineDir(machine));
    const resolved = path.resolve(root, safe);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
    return { safe, resolved, root };
  }

  function encodeRelativePath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
  }

  function machineAssetUrl(machine, token, relativePath) {
    return `/machine-assets/${encodeURIComponent(machine.id)}/${encodeRelativePath(relativePath)}?machine_token=${encodeURIComponent(token)}`;
  }

  function getModelDir(machine, modelName) {
    const root = machineDir(machine);
    const name = modelName || machine.activeModel || 'Default';
    if (name === 'Default') return { directory: root, relative: '' };
    const safeName = path.basename(String(name)).slice(0, 100);
    const directory = path.resolve(root, safeName);
    if (!directory.startsWith(`${path.resolve(root)}${path.sep}`)) return { directory: root, relative: '' };
    return { directory, relative: safeName };
  }

  function findExistingFile(directory, baseName, extensions) {
    for (const extension of extensions) {
      const filePath = path.join(directory, `${baseName}${extension}`);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return `${baseName}${extension}`;
    }
    return null;
  }

  function scanModelAssets(machine, token, modelDirectory, modelRelative) {
    const assets = {};
    for (const state of STATE_NAMES) {
      const fileName = findExistingFile(modelDirectory, state, ASSET_EXTENSIONS);
      if (fileName) {
        const relative = modelRelative ? `${modelRelative}/${fileName}` : fileName;
        assets[state] = machineAssetUrl(machine, token, relative);
      }
    }
    return assets;
  }

  function scanVariants(directory, baseNames, extensions, makeUrl, maxVariants = 20) {
    const variants = [];
    let activeBase = null;
    for (const baseName of baseNames) {
      const found = findExistingFile(directory, baseName, extensions);
      if (found) {
        activeBase = baseName;
        variants.push(makeUrl(found));
        break;
      }
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
      if (found) {
        activeBase = baseName;
        variants.push(makeUrl(found));
        break;
      }
    }
    if (!activeBase) return variants;
    const parts = activeBase.split('_');
    for (let index = 2; index <= maxVariants; index++) {
      const firstName = `${activeBase}${index}`;
      const secondName = parts.length >= 2 ? `${parts[0]}${index}_${parts.slice(1).join('_')}` : null;
      const first = findExistingFile(directory, firstName, extensions);
      const second = secondName ? findExistingFile(directory, secondName, extensions) : null;
      const found = first || second;
      if (!found) break;
      variants.push(makeUrl(found));
    }
    return variants;
  }

  function scanSubs(machine, token, parentDir, parentRelative, depth = 0) {
    if (depth >= 5) return [];
    const subsDir = path.join(parentDir, 'subs');
    if (!fs.existsSync(subsDir)) return [];
    const result = [];

    for (const entry of fs.readdirSync(subsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const subDir = path.join(subsDir, entry.name);
      const subRelative = parentRelative ? `${parentRelative}/subs/${entry.name}` : `subs/${entry.name}`;
      const makeUrl = fileName => machineAssetUrl(machine, token, `${subRelative}/${fileName}`);
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
          subs: scanSubs(machine, token, subDir, subRelative, depth + 1)
        });
      }
    }
    return result;
  }

  function scanEmotes(machine, token, modelDirectory, modelRelative) {
    const emotesDirectory = path.join(modelDirectory, 'emotes');
    if (!fs.existsSync(emotesDirectory)) return [];
    const emotes = [];

    for (const entry of fs.readdirSync(emotesDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const emoteDir = path.join(emotesDirectory, entry.name);
      const emoteRelative = modelRelative
        ? `${modelRelative}/emotes/${entry.name}`
        : `emotes/${entry.name}`;
      const makeUrl = fileName => machineAssetUrl(machine, token, `${emoteRelative}/${fileName}`);
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
          subs: scanSubs(machine, token, emoteDir, emoteRelative)
        });
      }
    }
    return emotes;
  }

  function listModels(machine, token) {
    const root = machineDir(machine);
    fs.mkdirSync(root, { recursive: true });
    const models = [];
    const rootAssets = scanModelAssets(machine, token, root, '');
    if (Object.keys(rootAssets).length) models.push({ name: 'Default', assetCount: Object.keys(rootAssets).length });

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const modelAssets = scanModelAssets(machine, token, path.join(root, entry.name), entry.name);
      if (Object.keys(modelAssets).length) {
        models.push({ name: entry.name, assetCount: Object.keys(modelAssets).length });
      }
    }
    return models;
  }

  function listFilesRecursive(root, current = root, output = [], depth = 0) {
    if (depth > MAX_PATH_DEPTH || !fs.existsSync(current)) return output;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        listFilesRecursive(root, absolute, output, depth + 1);
      } else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        const stats = fs.statSync(absolute);
        output.push({ path: relative, size: stats.size, updatedAt: stats.mtime.toISOString() });
      }
    }
    return output;
  }

  function removeEmptyParents(startDir, stopDir) {
    let current = path.dirname(startDir);
    const stop = path.resolve(stopDir);
    while (current.startsWith(stop) && current !== stop) {
      if (fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    }
  }

  function broadcastMachine(machineId, data, targetType = null) {
    const clients = machineClients.get(machineId);
    if (!clients) return;
    const payload = JSON.stringify(data);
    for (const socket of clients) {
      if (socket.readyState === 1 && (!targetType || socket.clientType === targetType)) {
        socket._asNativeSend(payload);
      }
    }
  }

  function withMachineContext(machineId, callback) {
    const previous = activeMachineContext;
    activeMachineContext = machineId;
    try { return callback(); } finally { activeMachineContext = previous; }
  }

  function installRoutes(app) {
    app.use(expressModule.json({ limit: '32kb' }));

    app.post('/api/machine/register', (req, res) => {
      if (registry.machines.length >= MAX_MACHINES) {
        return res.status(409).json({ error: 'machine registration limit reached' });
      }
      const name = sanitizeMachineName(req.body && req.body.name);
      if (!name) return res.status(400).json({ error: 'machine name required' });

      const token = crypto.randomBytes(32).toString('base64url');
      const machine = {
        id: crypto.randomBytes(12).toString('hex'),
        name,
        tokenHash: hashToken(token),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        activeModel: 'Default'
      };
      registry.machines.push(machine);
      fs.mkdirSync(machineDir(machine), { recursive: true });
      saveRegistry();
      console.log(`[machine] Registered ${machine.name} (${machine.id})`);
      return res.status(201).json({
        success: true,
        token,
        machine: { id: machine.id, name: machine.name, createdAt: machine.createdAt }
      });
    });

    app.get('/api/machine/status', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const files = listFilesRecursive(machineDir(machine));
      return res.json({
        authenticated: true,
        machine: { id: machine.id, name: machine.name, createdAt: machine.createdAt },
        activeModel: machine.activeModel || 'Default',
        fileCount: files.length,
        storageBytes: files.reduce((sum, file) => sum + file.size, 0),
        maxUploadBytes: MAX_UPLOAD_BYTES
      });
    });

    app.get('/api/machine/files', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      return res.json({ files: listFilesRecursive(machineDir(machine)) });
    });

    app.put('/api/machine/assets', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const target = resolveMachineAssetPath(machine, req.query.path);
      if (!target) return res.status(400).json({ error: 'invalid or unsupported asset path' });

      const declaredLength = Number(req.headers['content-length'] || 0);
      if (declaredLength > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'file exceeds 250 MB limit' });

      fs.mkdirSync(path.dirname(target.resolved), { recursive: true });
      const tempPath = path.join(UPLOAD_TMP_DIR, `${machine.id}-${crypto.randomBytes(12).toString('hex')}.upload`);
      const output = fs.createWriteStream(tempPath, { flags: 'wx', mode: 0o600 });
      let bytes = 0;
      let finished = false;

      const fail = (status, message) => {
        if (finished) return;
        finished = true;
        output.destroy();
        fs.rm(tempPath, { force: true }, () => {});
        if (!res.headersSent) res.status(status).json({ error: message });
      };

      req.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD_BYTES) {
          req.unpipe(output);
          req.resume();
          fail(413, 'file exceeds 250 MB limit');
        }
      });
      req.on('aborted', () => fail(499, 'upload aborted'));
      req.on('error', error => fail(500, error.message));
      output.on('error', error => fail(500, error.message));
      output.on('finish', () => {
        if (finished) return;
        finished = true;
        try {
          fs.rmSync(target.resolved, { force: true });
          fs.renameSync(tempPath, target.resolved);
          console.log(`[machine] ${machine.name} uploaded ${target.safe} (${bytes} bytes)`);
          res.json({ success: true, path: target.safe, size: bytes });
        } catch (error) {
          fs.rmSync(tempPath, { force: true });
          res.status(500).json({ error: error.message });
        }
      });
      req.pipe(output);
    });

    app.delete('/api/machine/assets', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const target = resolveMachineAssetPath(machine, req.query.path);
      if (!target || !fs.existsSync(target.resolved)) return res.status(404).json({ error: 'asset not found' });
      fs.unlinkSync(target.resolved);
      removeEmptyParents(target.resolved, target.root);
      return res.json({ success: true });
    });

    app.get('/machine-assets/:machineId/*', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      if (machine.id !== req.params.machineId) return res.status(403).json({ error: 'asset belongs to another machine' });
      const target = resolveMachineAssetPath(machine, req.params[0]);
      if (!target || !fs.existsSync(target.resolved)) return res.status(404).end();
      res.setHeader('Cache-Control', 'private, no-store');
      return res.sendFile(target.resolved);
    });

    app.get('/api/models', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const models = listModels(machine, req.machineToken);
      const names = new Set(models.map(model => model.name));
      if (!names.has(machine.activeModel)) machine.activeModel = models[0]?.name || 'Default';
      return res.json({ models, active: machine.activeModel || 'Default' });
    });

    app.get('/api/assets', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const requestedModel = String(req.query.model || machine.activeModel || 'Default');
      const models = listModels(machine, req.machineToken);
      if (!models.some(model => model.name === requestedModel)) return res.json({});
      const model = getModelDir(machine, requestedModel);
      return res.json(scanModelAssets(machine, req.machineToken, model.directory, model.relative));
    });

    app.post('/api/models/select', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const modelName = String(req.body && req.body.model || '');
      const models = listModels(machine, req.machineToken);
      if (!models.some(model => model.name === modelName)) return res.status(404).json({ error: 'model not found for this machine' });
      machine.activeModel = modelName;
      activeEmotes.delete(machine.id);
      saveRegistry();
      broadcastMachine(machine.id, { type: 'model_change', model: modelName });
      return res.json({ success: true, active: modelName });
    });

    app.get('/api/emotes', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const model = getModelDir(machine, machine.activeModel);
      return res.json(scanEmotes(machine, req.machineToken, model.directory, model.relative));
    });

    app.post('/api/emote/trigger', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const model = getModelDir(machine, machine.activeModel);
      const emotes = scanEmotes(machine, req.machineToken, model.directory, model.relative);
      const emote = emotes.find(item => item.name === req.body?.name);
      if (!emote) return res.status(404).json({ error: 'emote not found for this machine' });
      activeEmotes.set(machine.id, emote);
      broadcastMachine(machine.id, { type: 'emote', action: 'trigger', name: emote.name, emote });
      return res.json({ success: true, emote });
    });

    app.post('/api/emote/release', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      activeEmotes.delete(machine.id);
      broadcastMachine(machine.id, { type: 'emote', action: 'release' });
      return res.json({ success: true });
    });

    app.post('/api/emote/sub', (req, res) => {
      const machine = authenticateRequest(req, res);
      if (!machine) return;
      const activeEmote = activeEmotes.get(machine.id);
      if (!activeEmote) return res.status(400).json({ error: 'no emote is active for this machine' });
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

  const nativeExpressFactory = expressModule;
  function machineExpressFactory(...args) {
    const app = nativeExpressFactory(...args);
    installRoutes(app);
    return app;
  }
  Object.assign(machineExpressFactory, nativeExpressFactory);
  machineExpressFactory.application = nativeExpressFactory.application;
  machineExpressFactory.request = nativeExpressFactory.request;
  machineExpressFactory.response = nativeExpressFactory.response;
  require.cache[require.resolve('express')].exports = machineExpressFactory;

  function authenticateWebSocket(request) {
    const token = extractToken(request);
    const machine = findMachineByToken(token);
    if (!machine) return null;
    machine.lastSeenAt = new Date().toISOString();
    return machine;
  }

  function attachSocket(socket, machine) {
    socket.machineId = machine.id;
    let clients = machineClients.get(machine.id);
    if (!clients) {
      clients = new Set();
      machineClients.set(machine.id, clients);
    }
    clients.add(socket);

    const nativeSend = socket.send.bind(socket);
    socket._asNativeSend = nativeSend;
    socket.send = function scopedSend(data, ...args) {
      if (activeMachineContext && activeMachineContext !== machine.id) return;
      return nativeSend(data, ...args);
    };

    const nativeOn = socket.on.bind(socket);
    socket.on = function scopedOn(event, listener) {
      if (event === 'message') {
        return nativeOn(event, (...args) => withMachineContext(machine.id, () => listener.apply(socket, args)));
      }
      return nativeOn(event, listener);
    };

    nativeOn('close', () => {
      clients.delete(socket);
      if (clients.size === 0) machineClients.delete(machine.id);
    });
  }

  return {
    authenticateWebSocket,
    attachSocket,
    getMachineCount: () => registry.machines.length
  };
}

module.exports = { installMachineMode };
