const path = require('path');
const fs = require('fs');

const API_VERSION = '1.0';
const VALID_STATES = new Set([
  'neutral', 'happy', 'sad', 'surprised', 'eyes_closed', 'typing'
]);
const REQUEST_TTL_MS = 5 * 60 * 1000;

function createError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function installAutomationApi(ctx) {
  const startedAt = Date.now();
  const requestCache = new Map();
  let sequence = 0;
  let overrideTimer = null;
  let emoteTimer = null;
  let seenModel = ctx.getActiveModel();
  let seenEmote = ctx.getActiveEmote()?.name || null;

  const runtime = {
    override: null,
    speaking: false,
    typing: false,
    subPath: [],
    tracking: { source: null, lastPacketAt: null },
    config: {
      eyesClosedDelayMs: 1500,
      sfxVolume: 1,
      swapDuration: 200,
      crossfadeMode: false
    },
    updatedAt: new Date().toISOString()
  };

  const touch = () => { runtime.updatedAt = new Date().toISOString(); };
  const emit = (event, data = {}, source = 'server') => {
    ctx.broadcast({
      type: 'event',
      version: 1,
      sequence: ++sequence,
      timestamp: new Date().toISOString(),
      event,
      source,
      data
    }, 'streamerbot');
  };

  function listModels() {
    const models = [];
    const rootAssets = ctx.scanModelAssets(ctx.assetsDir, '/assets/');
    if (Object.keys(rootAssets).length) {
      models.push({ name: 'Default', assetCount: Object.keys(rootAssets).length });
    }

    try {
      for (const entry of fs.readdirSync(ctx.assetsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = ctx.getModelDir(entry.name);
        const assets = ctx.scanModelAssets(
          dir,
          `/assets/${encodeURIComponent(entry.name)}/`
        );
        if (Object.keys(assets).length) {
          models.push({ name: entry.name, assetCount: Object.keys(assets).length });
        }
      }
    } catch (error) {
      console.warn('[api-v1] Could not scan models:', error.message);
    }
    return models;
  }

  function normalizeModel(name) {
    if (!name || typeof name !== 'string') {
      throw createError(400, 'model_required', 'model name required');
    }
    const normalized = path.basename(name).substring(0, 100);
    if (!normalized || normalized !== name) {
      throw createError(400, 'invalid_model', 'invalid model name');
    }
    return normalized;
  }

  function effectiveState() {
    const tracked = ctx.getCurrentExpression();
    const expression = runtime.override && runtime.override !== 'typing'
      ? runtime.override
      : tracked;
    const typing = runtime.override === 'typing'
      ? true
      : (runtime.override ? false : runtime.typing);

    if (expression === 'eyes_closed') return 'eyes_closed';
    if (typing && !runtime.speaking) return 'typing';
    return `${expression}_${runtime.speaking ? 'speaking' : 'idle'}`;
  }

  function snapshot() {
    const active = ctx.getActiveEmote();
    const lastPacket = runtime.tracking.lastPacketAt
      ? Date.parse(runtime.tracking.lastPacketAt)
      : 0;

    return {
      model: ctx.getActiveModel(),
      expression: ctx.getCurrentExpression(),
      effectiveState: effectiveState(),
      override: runtime.override,
      speaking: runtime.speaking,
      typing: runtime.typing,
      activeEmote: active ? {
        name: active.name,
        emoteType: active.emoteType,
        subPath: [...runtime.subPath]
      } : null,
      tracking: {
        source: runtime.tracking.source,
        connected: lastPacket > 0 && Date.now() - lastPacket < 10000,
        lastPacketAt: runtime.tracking.lastPacketAt
      },
      config: { ...runtime.config },
      thresholds: ctx.getThresholds(),
      updatedAt: runtime.updatedAt
    };
  }

  function setOverride(state, options = {}, source = 'api') {
    if (state !== null && !VALID_STATES.has(state)) {
      throw createError(400, 'invalid_state', `unsupported state '${state}'`, {
        allowed: [...VALID_STATES]
      });
    }

    let duration = null;
    if (state !== null && options.durationMs !== undefined) {
      duration = Number(options.durationMs);
      if (!Number.isFinite(duration) || duration < 1 || duration > 3600000) {
        throw createError(400, 'invalid_duration', 'durationMs must be 1-3600000');
      }
    }

    if (overrideTimer) clearTimeout(overrideTimer);
    overrideTimer = null;
    runtime.override = state;
    touch();
    ctx.broadcastAll({ type: 'state_override', override: state });
    emit('state.override_changed', { override: state }, source);

    if (options.speaking !== undefined || options.typing !== undefined) {
      setVoice(options, source);
    }
    if (duration !== null) {
      overrideTimer = setTimeout(() => setOverride(null, {}, 'timer'), duration);
    }
    return { override: state, effectiveState: effectiveState() };
  }

  function setVoice(input = {}, source = 'api') {
    const speaking = input.speaking ?? runtime.speaking;
    const typing = input.typing ?? runtime.typing;
    if (typeof speaking !== 'boolean' || typeof typing !== 'boolean') {
      throw createError(400, 'invalid_voice_state', 'speaking and typing must be booleans');
    }

    runtime.speaking = speaking;
    runtime.typing = speaking ? false : typing;
    touch();
    ctx.broadcast({
      type: 'speaking',
      speaking: runtime.speaking,
      typing: runtime.typing
    }, 'overlay');
    emit('voice.changed', {
      speaking: runtime.speaking,
      typing: runtime.typing
    }, source);
    return {
      speaking: runtime.speaking,
      typing: runtime.typing,
      effectiveState: effectiveState()
    };
  }

  function setConfig(input = {}, source = 'api') {
    const next = {};
    const number = (key, min, max) => {
      if (input[key] === undefined) return;
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key])
          || input[key] < min || input[key] > max) {
        throw createError(400, 'invalid_config', `${key} must be ${min}-${max}`);
      }
      next[key] = input[key];
    };

    number('eyesClosedDelayMs', 0, 30000);
    number('sfxVolume', 0, 1);
    number('swapDuration', 0, 5000);
    if (input.crossfadeMode !== undefined) {
      if (typeof input.crossfadeMode !== 'boolean') {
        throw createError(400, 'invalid_config', 'crossfadeMode must be a boolean');
      }
      next.crossfadeMode = input.crossfadeMode;
    }

    Object.assign(runtime.config, next);
    touch();
    if (Object.keys(next).length) {
      ctx.broadcast({ type: 'config', ...next }, 'overlay');
      emit('config.changed', next, source);
    }
    return { ...runtime.config };
  }

  function setThresholds(input = {}, source = 'api') {
    const updated = ctx.setThresholds(input);
    touch();
    emit('thresholds.changed', updated, source);
    return updated;
  }

  function selectModel(name, source = 'api') {
    const model = normalizeModel(name);
    if (!listModels().some(item => item.name === model)) {
      throw createError(404, 'model_not_found', `model '${model}' not found`);
    }

    ctx.setActiveModel(model);
    ctx.setActiveEmote(null);
    seenModel = model;
    seenEmote = null;
    runtime.subPath = [];
    touch();
    ctx.broadcastAll({ type: 'model_change', model });
    emit('model.changed', { model }, source);
    return { active: model };
  }

  function triggerEmote(name, options = {}, source = 'api') {
    if (!name || typeof name !== 'string') {
      throw createError(400, 'emote_required', 'emote name required');
    }

    let duration = null;
    if (options.durationMs !== undefined) {
      duration = Number(options.durationMs);
      if (!Number.isFinite(duration) || duration < 1 || duration > 3600000) {
        throw createError(400, 'invalid_duration', 'durationMs must be 1-3600000');
      }
    }

    const emote = ctx.scanEmotes(ctx.getModelDir(ctx.getActiveModel()))
      .find(item => item.name === name);
    if (!emote) throw createError(404, 'emote_not_found', `emote '${name}' not found`);

    if (emoteTimer) clearTimeout(emoteTimer);
    emoteTimer = null;
    ctx.setActiveEmote(emote);
    seenEmote = emote.name;
    runtime.subPath = [];
    touch();
    ctx.broadcastAll({ type: 'emote', action: 'trigger', name, emote });
    emit('emote.started', { name, emoteType: emote.emoteType }, source);

    if (duration !== null) {
      emoteTimer = setTimeout(() => releaseEmote('timer'), duration);
    }
    return { emote };
  }

  function releaseEmote(source = 'api') {
    if (emoteTimer) clearTimeout(emoteTimer);
    emoteTimer = null;
    const name = ctx.getActiveEmote()?.name || null;
    ctx.setActiveEmote(null);
    seenEmote = null;
    runtime.subPath = [];
    touch();
    ctx.broadcastAll({ type: 'emote', action: 'release' });
    emit('emote.released', { name }, source);
    return { released: name };
  }

  function triggerSub(name, source = 'api') {
    const active = ctx.getActiveEmote();
    if (!active) throw createError(400, 'no_active_emote', 'no emote is active');
    if (!name || typeof name !== 'string') {
      throw createError(400, 'sub_required', 'sub-animation path required');
    }

    const parts = name.split('/').filter(Boolean);
    let subs = active.subs || [];
    let sub = null;
    for (const part of parts) {
      sub = subs.find(item => item.name === part);
      if (!sub) throw createError(404, 'sub_not_found', `sub-animation '${part}' not found`);
      subs = sub.subs || [];
    }

    runtime.subPath = parts;
    touch();
    ctx.broadcastAll({ type: 'emote', action: 'sub', sub, parentEmote: active.name });
    emit('emote.sub_changed', { name: active.name, subPath: parts }, source);
    return { sub, subPath: parts };
  }

  function execute(command, args = {}, requestId, source = 'api') {
    const now = Date.now();
    for (const [id, cached] of requestCache) {
      if (now - cached.at > REQUEST_TTL_MS) requestCache.delete(id);
    }
    if (requestId && requestCache.has(requestId)) {
      return { ...requestCache.get(requestId).result, duplicate: true };
    }

    let result;
    switch (command) {
      case 'state.get': result = {}; break;
      case 'state.override': result = setOverride(args.state ?? args.override, args, source); break;
      case 'state.auto': result = setOverride(null, {}, source); break;
      case 'voice.set': result = setVoice(args, source); break;
      case 'config.set': result = { config: setConfig(args, source) }; break;
      case 'thresholds.set': result = { thresholds: setThresholds(args, source) }; break;
      case 'model.select': result = selectModel(args.model ?? args.name, source); break;
      case 'emote.trigger': result = triggerEmote(args.name, args, source); break;
      case 'emote.release': result = releaseEmote(source); break;
      case 'emote.sub': result = triggerSub(args.name ?? args.path, source); break;
      default: throw createError(400, 'unknown_command', `unknown command '${command}'`);
    }

    const response = { command, ...result, state: snapshot() };
    if (requestId) requestCache.set(requestId, { at: now, result: response });
    return response;
  }

  function respond(res, fn) {
    try {
      res.json({ ok: true, ...fn() });
    } catch (error) {
      res.status(error.status || 500).json({
        ok: false,
        error: {
          code: error.code || 'internal_error',
          message: error.status ? error.message : 'Internal server error',
          ...(error.details ? { details: error.details } : {})
        }
      });
    }
  }

  ctx.app.get('/api/v1/health', (req, res) => {
    const clients = { overlay: 0, control: 0, streamerbot: 0 };
    for (const client of ctx.clients) {
      if (clients[client.clientType] !== undefined) clients[client.clientType]++;
    }
    res.json({
      ok: true,
      apiVersion: API_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      port: ctx.getPort(),
      clients,
      tracking: snapshot().tracking
    });
  });
  ctx.app.get('/api/v1/state', (req, res) => res.json({ ok: true, state: snapshot() }));
  ctx.app.get('/api/v1/capabilities', (req, res) => {
    const models = listModels().map(model => ({
      ...model,
      emotes: ctx.scanEmotes(ctx.getModelDir(model.name)).map(emote => ({
        name: emote.name,
        emoteType: emote.emoteType,
        subs: (emote.subs || []).map(sub => sub.name)
      }))
    }));
    res.json({
      ok: true,
      apiVersion: API_VERSION,
      states: [...VALID_STATES],
      models,
      commands: [
        'state.get', 'state.override', 'state.auto', 'voice.set',
        'config.set', 'thresholds.set', 'model.select',
        'emote.trigger', 'emote.release', 'emote.sub'
      ]
    });
  });
  ctx.app.put('/api/v1/state/override', (req, res) =>
    respond(res, () => ({ result: setOverride(req.body.state ?? req.body.override, req.body, 'rest') })));
  ctx.app.delete('/api/v1/state/override', (req, res) =>
    respond(res, () => ({ result: setOverride(null, {}, 'rest') })));
  ctx.app.put('/api/v1/voice', (req, res) =>
    respond(res, () => ({ result: setVoice(req.body, 'rest') })));
  ctx.app.get('/api/v1/config', (req, res) =>
    res.json({ ok: true, config: { ...runtime.config } }));
  ctx.app.put('/api/v1/config', (req, res) =>
    respond(res, () => ({ config: setConfig(req.body, 'rest') })));
  ctx.app.get('/api/v1/thresholds', (req, res) =>
    res.json({ ok: true, thresholds: ctx.getThresholds() }));
  ctx.app.put('/api/v1/thresholds', (req, res) =>
    respond(res, () => ({ thresholds: setThresholds(req.body, 'rest') })));
  ctx.app.put('/api/v1/models/:name/active', (req, res) =>
    respond(res, () => ({ result: selectModel(req.params.name, 'rest') })));
  ctx.app.get('/api/v1/models/:name/emotes', (req, res) => respond(res, () => {
    const model = normalizeModel(req.params.name);
    if (!listModels().some(item => item.name === model)) {
      throw createError(404, 'model_not_found', `model '${model}' not found`);
    }
    return { model, emotes: ctx.scanEmotes(ctx.getModelDir(model)) };
  }));
  ctx.app.post('/api/v1/emotes/:name/trigger', (req, res) =>
    respond(res, () => ({ result: triggerEmote(req.params.name, req.body, 'rest') })));
  ctx.app.post('/api/v1/emotes/release', (req, res) =>
    respond(res, () => ({ result: releaseEmote('rest') })));
  ctx.app.post('/api/v1/emotes/sub', (req, res) =>
    respond(res, () => ({ result: triggerSub(req.body.name ?? req.body.path, 'rest') })));
  ctx.app.post('/api/v1/commands', (req, res) => respond(res, () => ({
    requestId: req.body.requestId || null,
    result: execute(
      req.body.command,
      req.body.args || {},
      req.body.requestId,
      req.body.source || 'rest-command'
    )
  })));

  ctx.wss.on('connection', (ws) => {
    if (ws.clientType === 'streamerbot') {
      ws.send(JSON.stringify({
        type: 'hello',
        version: 1,
        apiVersion: API_VERSION,
        timestamp: new Date().toISOString(),
        state: snapshot()
      }));
    }

    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }

      if (ws.clientType === 'control') {
        if (message.type === 'speaking') {
          runtime.speaking = !!message.speaking;
          runtime.typing = runtime.speaking ? false : !!message.typing;
          touch();
          emit('voice.changed', {
            speaking: runtime.speaking,
            typing: runtime.typing
          }, 'control');
        } else if (message.type === 'state_override') {
          runtime.override = message.override || null;
          touch();
          emit('state.override_changed', { override: runtime.override }, 'control');
        } else if (message.type === 'config') {
          for (const key of ['eyesClosedDelayMs', 'sfxVolume', 'swapDuration', 'crossfadeMode']) {
            if (message[key] !== undefined) runtime.config[key] = message[key];
          }
          touch();
        }
      } else if (ws.clientType === 'overlay'
          && message.type === 'emote_status'
          && message.action === 'completed') {
        const active = ctx.getActiveEmote();
        if (active && (!message.name || active.name === message.name)) {
          ctx.setActiveEmote(null);
          seenEmote = null;
          runtime.subPath = [];
          touch();
          ctx.broadcast({ type: 'emote', action: 'release' }, 'control');
          emit('emote.completed', { name: active.name }, 'overlay');
        }
      } else if (ws.clientType === 'streamerbot' && message.type === 'command') {
        const id = message.id || message.requestId || null;
        try {
          ws.send(JSON.stringify({
            type: 'command.result',
            id,
            status: 'ok',
            result: execute(
              message.command,
              message.args || {},
              id,
              message.source || 'streamerbot'
            )
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'command.result',
            id,
            status: 'error',
            error: { code: error.code || 'internal_error', message: error.message }
          }));
        }
      }
    });
  });

  const syncTimer = setInterval(() => {
    const model = ctx.getActiveModel();
    const emote = ctx.getActiveEmote()?.name || null;
    if (model !== seenModel) {
      seenModel = model;
      touch();
      emit('model.changed', { model }, 'legacy');
    }
    if (emote !== seenEmote) {
      const previous = seenEmote;
      seenEmote = emote;
      runtime.subPath = [];
      touch();
      emit(emote ? 'emote.started' : 'emote.released', {
        name: emote || previous
      }, 'legacy');
    }
  }, 250);
  syncTimer.unref();

  return {
    recordTracking(data) {
      const previousExpression = runtime.tracking.expression;
      const previousSource = runtime.tracking.source;
      runtime.tracking.expression = data.expression;
      runtime.tracking.source = data.source || previousSource;
      runtime.tracking.lastPacketAt = new Date().toISOString();
      touch();
      if (previousExpression !== data.expression || previousSource !== runtime.tracking.source) {
        emit('expression.changed', {
          expression: data.expression,
          source: runtime.tracking.source
        }, runtime.tracking.source || 'tracking');
      }
    },
    snapshot
  };
}

module.exports = { installAutomationApi };
