'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_ACTORS_PER_MACHINE = 16;
const MAX_NAME_LENGTH = 60;
const MAX_SESSION_ID_LENGTH = 160;
const DEFAULT_SPEAKING_TIMEOUT_MS = 45000;
const MIN_SPEAKING_TIMEOUT_MS = 1000;
const MAX_SPEAKING_TIMEOUT_MS = 5 * 60 * 1000;
const ASSET_EXTENSIONS = ['.webm', '.webp', '.gif', '.png', '.mp4'];
const STATE_NAMES = [
  'neutral_idle', 'neutral_speaking',
  'happy_idle', 'happy_speaking',
  'sad_idle', 'sad_speaking',
  'surprised_idle', 'surprised_speaking',
  'typing', 'eyes_closed'
];
const EXPRESSIONS = new Set(['neutral', 'happy', 'sad', 'surprised', 'eyes_closed']);
const MODEL_SCOPES = new Set(['global', 'private']);

let installedApi = null;

function installActorMode(options = {}) {
  if (installedApi) return installedApi;

  const appDir = options.appDir || (process.pkg ? path.dirname(process.execPath) : __dirname);
  const dataDir = path.join(appDir, 'machine-data');
  const actorsPath = path.join(dataDir, 'actors.json');
  const registryPath = path.join(dataDir, 'registry.json');
  const machineAssetsDir = path.join(dataDir, 'assets');
  const globalAssetsDir = path.join(appDir, 'public', 'assets');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(machineAssetsDir, { recursive: true });
  fs.mkdirSync(globalAssetsDir, { recursive: true });

  let actorsDocument = loadActors();
  const runtimeStates = new Map();
  const speakingTimers = new Map();
  const actorClients = new Map();

  function loadActors() {
    try {
      const parsed = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
      if (parsed && parsed.version === 1 && Array.isArray(parsed.actors)) return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[actors] Could not read actors:', error.message);
    }
    return { version: 1, actors: [] };
  }

  function saveActors() {
    const temporaryPath = `${actorsPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(actorsDocument, null, 2), { mode: 0o600 });
    fs.rmSync(actorsPath, { force: true });
    fs.renameSync(temporaryPath, actorsPath);
  }

  function readMachines() {
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

  function tokenMatches(record, token) {
    if (!record || !token || typeof record.tokenHash !== 'string') return false;
    const candidate = Buffer.from(hashToken(token), 'hex');
    const expected = Buffer.from(record.tokenHash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }

  function extractToken(req, queryName, headerName) {
    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const queryToken = requestUrl.searchParams.get(queryName);
      if (queryToken) return queryToken;
    } catch { /* ignore malformed URL */ }

    const headerToken = req.headers?.[headerName];
    if (typeof headerToken === 'string' && headerToken) return headerToken;

    const authorization = req.headers?.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : '';
  }

  function machineToken(req) {
    return extractToken(req, 'machine_token', 'x-machine-token');
  }

  function actorToken(req) {
    return extractToken(req, 'actor_token', 'x-actor-token');
  }

  function findMachineByToken(token) {
    if (!token) return null;
    return readMachines().find(machine => tokenMatches(machine, token)) || null;
  }

  function findActor(actorId) {
    return actorsDocument.actors.find(actor => actor.id === actorId) || null;
  }

  function findActorByToken(actorId, token) {
    const actor = findActor(actorId);
    return actor && tokenMatches(actor, token) ? actor : null;
  }

  function authenticateMachine(req, res) {
    const machine = findMachineByToken(machineToken(req));
    if (!machine) {
      res.status(401).json({ error: 'machine registration token required', code: 'MACHINE_TOKEN_REQUIRED' });
      return null;
    }
    return machine;
  }

  function authenticateActor(req, res) {
    const actor = findActorByToken(req.params.actorId, actorToken(req));
    if (!actor) {
      res.status(401).json({ error: 'actor token required', code: 'ACTOR_TOKEN_REQUIRED' });
      return null;
    }
    return actor;
  }

  function authenticateOwnedActor(req, res) {
    const machine = authenticateMachine(req, res);
    if (!machine) return null;
    const actor = findActor(req.params.actorId);
    if (!actor || actor.machineId !== machine.id) {
      res.status(404).json({ error: 'actor not found for this machine' });
      return null;
    }
    return { machine, actor };
  }

  function sanitizeName(value) {
    return String(value || '')
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, MAX_NAME_LENGTH);
  }

  function sanitizeSessionId(value) {
    const result = String(value || '').trim();
    if (!result || result.length > MAX_SESSION_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(result)) return null;
    return result;
  }

  function sanitizeExpression(value) {
    const expression = String(value || '').trim().toLowerCase();
    return EXPRESSIONS.has(expression) ? expression : null;
  }

  function parseModelReference(value) {
    const raw = String(value || '').trim();
    const separator = raw.indexOf(':');
    if (separator <= 0) return null;
    const scope = raw.slice(0, separator);
    const name = raw.slice(separator + 1);
    if (!MODEL_SCOPES.has(scope) || !name || name.length > 100) return null;
    if (path.basename(name) !== name || /[\\/\u0000-\u001f\u007f:*?"<>|]/.test(name)) return null;
    return { raw: `${scope}:${name}`, scope, name };
  }

  function modelDirectory(machineId, modelReference) {
    const parsed = parseModelReference(modelReference);
    if (!parsed) return null;
    const base = parsed.scope === 'global'
      ? globalAssetsDir
      : path.join(machineAssetsDir, machineId);
    const directory = parsed.name === 'Default' ? base : path.join(base, parsed.name);
    const root = path.resolve(base);
    const resolved = path.resolve(directory);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
    return { ...parsed, root, directory: resolved };
  }

  function findExistingFile(directory, baseName) {
    for (const extension of ASSET_EXTENSIONS) {
      const filePath = path.join(directory, `${baseName}${extension}`);
      try {
        if (fs.statSync(filePath).isFile()) return `${baseName}${extension}`;
      } catch { /* file absent */ }
    }
    return null;
  }

  function countStateAssets(directory) {
    if (!fs.existsSync(directory)) return 0;
    return STATE_NAMES.reduce((count, state) => count + (findExistingFile(directory, state) ? 1 : 0), 0);
  }

  function listModelsForMachine(machineId) {
    const models = [];

    const collect = (scope, root) => {
      const add = (name, directory) => {
        const assetCount = countStateAssets(directory);
        if (assetCount > 0) models.push({
          name: `${scope}:${name}`,
          displayName: name,
          scope,
          assetCount
        });
      };

      fs.mkdirSync(root, { recursive: true });
      add('Default', root);
      let entries = [];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch { /* empty library */ }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && entry.name !== 'Default') add(entry.name, path.join(root, entry.name));
      }
    };

    collect('global', globalAssetsDir);
    collect('private', path.join(machineAssetsDir, machineId));
    return models;
  }

  function validateModel(machineId, value) {
    const parsed = parseModelReference(value);
    if (!parsed) return null;
    const model = modelDirectory(machineId, parsed.raw);
    if (!model || countStateAssets(model.directory) === 0) return null;
    return parsed.raw;
  }

  function defaultModelForMachine(machineId) {
    return listModelsForMachine(machineId)[0]?.name || null;
  }

  function getRuntimeState(actor) {
    let state = runtimeStates.get(actor.id);
    if (!state) {
      state = {
        expression: sanitizeExpression(actor.defaultExpression) || 'neutral',
        speaking: false,
        speechSessionId: null,
        speakingExpiresAt: null,
        revision: 0,
        updatedAt: new Date().toISOString()
      };
      runtimeStates.set(actor.id, state);
    }
    return state;
  }

  function publicState(actor) {
    const state = getRuntimeState(actor);
    return {
      actorId: actor.id,
      expression: state.expression,
      speaking: state.speaking,
      speechSessionId: state.speechSessionId,
      speakingExpiresAt: state.speakingExpiresAt,
      revision: state.revision,
      updatedAt: state.updatedAt
    };
  }

  function publicActor(actor) {
    return {
      id: actor.id,
      machineId: actor.machineId,
      name: actor.name,
      activeModel: actor.activeModel,
      defaultExpression: actor.defaultExpression,
      createdAt: actor.createdAt,
      updatedAt: actor.updatedAt,
      state: publicState(actor)
    };
  }

  function actorObsUrl(req, actor, token) {
    const protocol = req.protocol || (req.socket?.encrypted ? 'https' : 'http');
    const host = req.get?.('host') || req.headers?.host || 'localhost:3000';
    const hash = new URLSearchParams({ actor_id: actor.id, actor_token: token });
    return `${protocol}://${host}/actor-overlay.html#${hash.toString()}`;
  }

  function clearSpeakingTimer(actorId) {
    const timer = speakingTimers.get(actorId);
    if (timer) clearTimeout(timer);
    speakingTimers.delete(actorId);
  }

  function broadcastActor(actorId, data) {
    const clients = actorClients.get(actorId);
    if (!clients) return;
    const payload = JSON.stringify(data);
    for (const socket of clients) {
      if (socket.readyState === 1 && typeof socket._asNativeSend === 'function') {
        socket._asNativeSend(payload);
      }
    }
  }

  function broadcastState(actor) {
    const state = getRuntimeState(actor);
    broadcastActor(actor.id, { type: 'state_override', override: state.expression, actorId: actor.id, revision: state.revision });
    broadcastActor(actor.id, {
      type: 'speaking',
      speaking: state.speaking,
      typing: false,
      actorId: actor.id,
      speechSessionId: state.speechSessionId,
      speakingExpiresAt: state.speakingExpiresAt,
      revision: state.revision
    });
    broadcastActor(actor.id, { type: 'actor_state', actor: publicActor(actor) });
  }

  function commitRuntimeChange(actor, mutate) {
    const state = getRuntimeState(actor);
    mutate(state);
    state.revision += 1;
    state.updatedAt = new Date().toISOString();
    broadcastState(actor);
    return state;
  }

  function stopSpeaking(actor, expectedSessionId = null, reason = 'stopped') {
    const state = getRuntimeState(actor);
    if (expectedSessionId && state.speechSessionId && expectedSessionId !== state.speechSessionId) {
      return { stale: true, state };
    }
    clearSpeakingTimer(actor.id);
    commitRuntimeChange(actor, current => {
      current.speaking = false;
      current.speechSessionId = null;
      current.speakingExpiresAt = null;
    });
    console.log(`[actors] ${actor.name} speaking ${reason}`);
    return { stale: false, state: getRuntimeState(actor) };
  }

  function startSpeaking(actor, sessionId, expiresInMs) {
    clearSpeakingTimer(actor.id);
    const timeoutMs = Math.max(MIN_SPEAKING_TIMEOUT_MS, Math.min(MAX_SPEAKING_TIMEOUT_MS, Number(expiresInMs) || DEFAULT_SPEAKING_TIMEOUT_MS));
    const expiresAtMs = Date.now() + timeoutMs;
    commitRuntimeChange(actor, state => {
      state.speaking = true;
      state.speechSessionId = sessionId;
      state.speakingExpiresAt = new Date(expiresAtMs).toISOString();
    });

    const timer = setTimeout(() => {
      speakingTimers.delete(actor.id);
      const current = getRuntimeState(actor);
      if (current.speaking && current.speechSessionId === sessionId) stopSpeaking(actor, sessionId, 'timed out');
    }, timeoutMs);
    timer.unref?.();
    speakingTimers.set(actor.id, timer);
    return getRuntimeState(actor);
  }

  function resetActorState(actor) {
    clearSpeakingTimer(actor.id);
    return commitRuntimeChange(actor, state => {
      state.expression = sanitizeExpression(actor.defaultExpression) || 'neutral';
      state.speaking = false;
      state.speechSessionId = null;
      state.speakingExpiresAt = null;
    });
  }

  function encodeRelativePath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
  }

  function actorAssetUrl(actor, token, modelReference, relativePath) {
    const query = new URLSearchParams({ actor_token: token, model: modelReference });
    return `/actor-assets/${encodeURIComponent(actor.id)}/${encodeRelativePath(relativePath)}?${query.toString()}`;
  }

  function scanActorAssets(actor, token) {
    const model = modelDirectory(actor.machineId, actor.activeModel);
    if (!model || !fs.existsSync(model.directory)) return {};
    const exact = {};
    for (const state of STATE_NAMES) {
      const fileName = findExistingFile(model.directory, state);
      if (fileName) exact[state] = actorAssetUrl(actor, token, actor.activeModel, fileName);
    }

    const fallbackOrder = {
      neutral_idle: ['neutral_idle'],
      neutral_speaking: ['neutral_speaking', 'neutral_idle'],
      happy_idle: ['happy_idle', 'neutral_idle'],
      happy_speaking: ['happy_speaking', 'happy_idle', 'neutral_speaking', 'neutral_idle'],
      sad_idle: ['sad_idle', 'neutral_idle'],
      sad_speaking: ['sad_speaking', 'sad_idle', 'neutral_speaking', 'neutral_idle'],
      surprised_idle: ['surprised_idle', 'neutral_idle'],
      surprised_speaking: ['surprised_speaking', 'surprised_idle', 'neutral_speaking', 'neutral_idle'],
      typing: ['typing', 'neutral_idle'],
      eyes_closed: ['eyes_closed', 'neutral_idle']
    };

    const result = {};
    for (const state of STATE_NAMES) {
      const fallback = fallbackOrder[state].find(candidate => exact[candidate]);
      if (fallback) result[state] = exact[fallback];
    }
    return result;
  }

  function sanitizeAssetRelativePath(value) {
    const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw || raw.length > 500 || raw.includes('\0')) return null;
    const parts = raw.split('/');
    if (parts.length > 4 || parts.some(part => !part || part === '.' || part === '..')) return null;
    if (parts.some(part => /[\u0000-\u001f\u007f:*?"<>|]/.test(part))) return null;
    const extension = path.extname(parts[parts.length - 1]).toLowerCase();
    if (!ASSET_EXTENSIONS.includes(extension)) return null;
    return parts.join('/');
  }

  function installRoutes(app) {
    app.get('/api/actors/models', (req, res) => {
      const machine = authenticateMachine(req, res);
      if (!machine) return;
      return res.json({ models: listModelsForMachine(machine.id) });
    });

    app.get('/api/actors', (req, res) => {
      const machine = authenticateMachine(req, res);
      if (!machine) return;
      const actors = actorsDocument.actors.filter(actor => actor.machineId === machine.id).map(publicActor);
      return res.json({ actors, maxActors: MAX_ACTORS_PER_MACHINE });
    });

    app.post('/api/actors', (req, res) => {
      const machine = authenticateMachine(req, res);
      if (!machine) return;
      const existingCount = actorsDocument.actors.filter(actor => actor.machineId === machine.id).length;
      if (existingCount >= MAX_ACTORS_PER_MACHINE) return res.status(409).json({ error: 'actor limit reached for this machine' });

      const name = sanitizeName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'actor name required' });
      const requestedModel = req.body?.model || defaultModelForMachine(machine.id);
      const activeModel = validateModel(machine.id, requestedModel);
      if (!activeModel) return res.status(400).json({ error: 'valid global: or private: model required' });
      const defaultExpression = sanitizeExpression(req.body?.defaultExpression || 'neutral');
      if (!defaultExpression) return res.status(400).json({ error: 'unsupported default expression' });

      const token = crypto.randomBytes(32).toString('base64url');
      const now = new Date().toISOString();
      const actor = {
        id: `actor-${crypto.randomBytes(8).toString('hex')}`,
        machineId: machine.id,
        name,
        tokenHash: hashToken(token),
        activeModel,
        defaultExpression,
        createdAt: now,
        updatedAt: now
      };
      actorsDocument.actors.push(actor);
      saveActors();
      getRuntimeState(actor);
      console.log(`[actors] Created ${actor.name} (${actor.id}) using ${actor.activeModel}`);
      return res.status(201).json({
        success: true,
        actor: publicActor(actor),
        token,
        obsUrl: actorObsUrl(req, actor, token)
      });
    });

    app.patch('/api/actors/:actorId', (req, res) => {
      const owned = authenticateOwnedActor(req, res);
      if (!owned) return;
      const { machine, actor } = owned;

      let modelChanged = false;
      if (req.body?.name !== undefined) {
        const name = sanitizeName(req.body.name);
        if (!name) return res.status(400).json({ error: 'actor name required' });
        actor.name = name;
      }
      if (req.body?.model !== undefined) {
        const model = validateModel(machine.id, req.body.model);
        if (!model) return res.status(400).json({ error: 'model not found for this machine' });
        if (model !== actor.activeModel) {
          actor.activeModel = model;
          modelChanged = true;
        }
      }
      if (req.body?.defaultExpression !== undefined) {
        const expression = sanitizeExpression(req.body.defaultExpression);
        if (!expression) return res.status(400).json({ error: 'unsupported default expression' });
        actor.defaultExpression = expression;
      }
      actor.updatedAt = new Date().toISOString();
      saveActors();

      if (modelChanged) {
        clearSpeakingTimer(actor.id);
        runtimeStates.delete(actor.id);
        broadcastActor(actor.id, { type: 'model_change', model: actor.activeModel, actorId: actor.id });
        setTimeout(() => broadcastState(actor), 0);
      }
      return res.json({ success: true, actor: publicActor(actor) });
    });

    app.delete('/api/actors/:actorId', (req, res) => {
      const owned = authenticateOwnedActor(req, res);
      if (!owned) return;
      const { actor } = owned;

      clearSpeakingTimer(actor.id);
      runtimeStates.delete(actor.id);
      const clients = actorClients.get(actor.id);
      if (clients) {
        for (const socket of clients) socket.close(4002, 'actor deleted');
        actorClients.delete(actor.id);
      }

      actorsDocument.actors = actorsDocument.actors.filter(item => item.id !== actor.id);
      saveActors();
      console.log(`[actors] Deleted ${actor.name} (${actor.id})`);
      return res.json({ success: true, actorId: actor.id });
    });

    app.post('/api/actors/:actorId/token/regenerate', (req, res) => {
      const owned = authenticateOwnedActor(req, res);
      if (!owned) return;
      const { actor } = owned;
      const token = crypto.randomBytes(32).toString('base64url');
      actor.tokenHash = hashToken(token);
      actor.updatedAt = new Date().toISOString();
      saveActors();
      const clients = actorClients.get(actor.id);
      if (clients) {
        for (const socket of clients) socket.close(4001, 'actor token regenerated');
      }
      return res.json({ success: true, actor: publicActor(actor), token, obsUrl: actorObsUrl(req, actor, token) });
    });

    app.post('/api/actors/:actorId/manage/state', (req, res) => {
      const owned = authenticateOwnedActor(req, res);
      if (!owned) return;
      const { actor } = owned;
      let changed = false;

      if (req.body?.expression !== undefined) {
        const expression = sanitizeExpression(req.body.expression);
        if (!expression) return res.status(400).json({ error: 'unsupported expression' });
        const state = getRuntimeState(actor);
        if (expression !== state.expression) {
          commitRuntimeChange(actor, current => { current.expression = expression; });
          changed = true;
        }
      }

      if (req.body?.speaking !== undefined) {
        if (typeof req.body.speaking !== 'boolean') return res.status(400).json({ error: 'speaking must be true or false' });
        if (req.body.speaking) {
          const requestedSessionId = sanitizeSessionId(req.body.speechSessionId);
          const sessionId = requestedSessionId || `control-${crypto.randomBytes(8).toString('hex')}`;
          startSpeaking(actor, sessionId, req.body.expiresInMs);
          changed = true;
        } else {
          stopSpeaking(actor, null, 'stopped by control panel');
          changed = true;
        }
      }

      return res.json({ success: true, changed, actor: publicActor(actor) });
    });

    app.post('/api/actors/:actorId/manage/reset', (req, res) => {
      const owned = authenticateOwnedActor(req, res);
      if (!owned) return;
      const { actor } = owned;
      resetActorState(actor);
      return res.json({ success: true, actor: publicActor(actor) });
    });

    app.get('/api/actors/:actorId/state', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;
      return res.json({ actor: publicActor(actor) });
    });

    app.post('/api/actors/:actorId/state', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;
      let changed = false;

      if (req.body?.expression !== undefined) {
        const expression = sanitizeExpression(req.body.expression);
        if (!expression) return res.status(400).json({ error: 'unsupported expression' });
        const state = getRuntimeState(actor);
        if (expression !== state.expression) {
          commitRuntimeChange(actor, current => { current.expression = expression; });
          changed = true;
        }
      }

      if (req.body?.speaking !== undefined) {
        if (typeof req.body.speaking !== 'boolean') return res.status(400).json({ error: 'speaking must be true or false' });
        if (req.body.speaking) {
          const sessionId = sanitizeSessionId(req.body.speechSessionId);
          if (!sessionId) return res.status(400).json({ error: 'speechSessionId required when speaking starts' });
          startSpeaking(actor, sessionId, req.body.expiresInMs);
          changed = true;
        } else {
          const current = getRuntimeState(actor);
          const sessionId = sanitizeSessionId(req.body.speechSessionId);
          if (current.speaking && current.speechSessionId && !sessionId) {
            return res.status(400).json({ error: 'speechSessionId required when stopping an active speech session' });
          }
          const result = stopSpeaking(actor, sessionId, 'stopped');
          if (result.stale) return res.json({ success: true, stale: true, actor: publicActor(actor) });
          changed = true;
        }
      }

      return res.json({ success: true, changed, actor: publicActor(actor) });
    });

    app.post('/api/actors/:actorId/reset', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;
      resetActorState(actor);
      return res.json({ success: true, actor: publicActor(actor) });
    });

    app.get('/api/actors/:actorId/assets', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;
      return res.json(scanActorAssets(actor, actorToken(req)));
    });

    app.get('/actor-assets/:actorId/*', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;
      const requestedModel = String(req.query.model || '');
      if (requestedModel !== actor.activeModel) return res.status(409).json({ error: 'actor model changed; refresh the overlay' });
      const model = modelDirectory(actor.machineId, actor.activeModel);
      const relative = sanitizeAssetRelativePath(req.params[0]);
      if (!model || !relative) return res.status(400).end();
      const resolved = path.resolve(model.directory, relative);
      if (resolved !== model.directory && !resolved.startsWith(`${model.directory}${path.sep}`)) return res.status(403).end();
      try {
        if (!fs.statSync(resolved).isFile()) return res.status(404).end();
      } catch {
        return res.status(404).end();
      }
      res.setHeader('Cache-Control', 'private, no-store');
      return res.sendFile(resolved);
    });
  }

  const currentExpressFactory = require('express');
  function actorExpressFactory(...args) {
    const app = currentExpressFactory(...args);
    installRoutes(app);
    return app;
  }
  Object.assign(actorExpressFactory, currentExpressFactory);
  actorExpressFactory.application = currentExpressFactory.application;
  actorExpressFactory.request = currentExpressFactory.request;
  actorExpressFactory.response = currentExpressFactory.response;
  require.cache[require.resolve('express')].exports = actorExpressFactory;

  function authenticateWebSocket(request) {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, 'http://localhost');
    } catch {
      return null;
    }
    const actorId = requestUrl.searchParams.get('actor_id');
    const token = requestUrl.searchParams.get('actor_token') || extractToken(request, 'actor_token', 'x-actor-token');
    const actor = findActorByToken(actorId, token);
    return actor ? { kind: 'actor', actor } : null;
  }

  function attachSocket(socket, context) {
    const actor = context?.actor || context;
    if (!actor?.id) return;
    socket.actorId = actor.id;
    socket.clientType = 'actor-overlay';
    const nativeSend = socket.send.bind(socket);
    socket._asNativeSend = nativeSend;
    socket.send = function suppressSharedServerTraffic(data, options, callback) {
      const done = typeof options === 'function' ? options : callback;
      if (typeof done === 'function') queueMicrotask(() => done());
    };

    let clients = actorClients.get(actor.id);
    if (!clients) {
      clients = new Set();
      actorClients.set(actor.id, clients);
    }
    clients.add(socket);
    socket.once('close', () => {
      clients.delete(socket);
      if (clients.size === 0) actorClients.delete(actor.id);
    });

    const bootstrap = setTimeout(() => broadcastState(actor), 25);
    bootstrap.unref?.();
  }

  installedApi = {
    authenticateWebSocket,
    attachSocket,
    getActorCount: () => actorsDocument.actors.length
  };
  console.log('  AI Actor MVP enabled (actor-scoped API and OBS overlays).');
  return installedApi;
}

module.exports = { installActorMode };
