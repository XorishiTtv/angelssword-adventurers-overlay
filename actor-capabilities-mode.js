'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET_EXTENSIONS = ['.webm', '.webp', '.gif', '.png', '.mp4'];
const EXPRESSION_DEFINITIONS = [
  { name: 'neutral', idle: 'neutral_idle', speaking: 'neutral_speaking' },
  { name: 'happy', idle: 'happy_idle', speaking: 'happy_speaking' },
  { name: 'sad', idle: 'sad_idle', speaking: 'sad_speaking' },
  { name: 'surprised', idle: 'surprised_idle', speaking: 'surprised_speaking' },
  { name: 'eyes_closed', idle: 'eyes_closed', speaking: null }
];
const MODEL_SCOPES = new Set(['global', 'private']);
const MAX_SUB_DEPTH = 5;

let installed = false;

function installActorCapabilitiesMode(options = {}) {
  if (installed) return;

  const appDir = options.appDir || (process.pkg ? path.dirname(process.execPath) : __dirname);
  const dataDir = path.join(appDir, 'machine-data');
  const actorsPath = path.join(dataDir, 'actors.json');
  const machineAssetsDir = path.join(dataDir, 'assets');
  const globalAssetsDir = path.join(appDir, 'public', 'assets');

  function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  function tokenMatches(actor, token) {
    if (!actor || !token || typeof actor.tokenHash !== 'string') return false;
    try {
      const candidate = Buffer.from(hashToken(token), 'hex');
      const expected = Buffer.from(actor.tokenHash, 'hex');
      return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
    } catch {
      return false;
    }
  }

  function extractActorToken(req) {
    const authorization = String(req.headers?.authorization || '');
    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    if (bearer) return bearer[1];

    const headerToken = req.headers?.['x-actor-token'];
    if (typeof headerToken === 'string' && headerToken) return headerToken;

    try {
      return new URL(req.url, 'http://localhost').searchParams.get('actor_token') || '';
    } catch {
      return '';
    }
  }

  function readActors() {
    try {
      const parsed = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
      return parsed && Array.isArray(parsed.actors) ? parsed.actors : [];
    } catch {
      return [];
    }
  }

  function authenticateActor(req, res) {
    const actor = readActors().find(item => item.id === req.params.actorId) || null;
    if (!actor || !tokenMatches(actor, extractActorToken(req))) {
      res.status(401).json({ error: 'actor token required', code: 'ACTOR_TOKEN_REQUIRED' });
      return null;
    }
    return actor;
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

  function modelDirectory(actor) {
    const parsed = parseModelReference(actor.activeModel);
    if (!parsed) return null;
    const base = parsed.scope === 'global'
      ? globalAssetsDir
      : path.join(machineAssetsDir, actor.machineId);
    const directory = parsed.name === 'Default' ? base : path.join(base, parsed.name);
    const root = path.resolve(base);
    const resolved = path.resolve(directory);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
    return { ...parsed, directory: resolved };
  }

  function findExistingFile(directory, baseName) {
    if (!directory || !baseName) return null;
    for (const extension of ASSET_EXTENSIONS) {
      const candidate = path.join(directory, `${baseName}${extension}`);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* file absent */ }
    }
    return null;
  }

  function expressionCapabilities(directory) {
    if (!directory || !fs.existsSync(directory)) return [];
    return EXPRESSION_DEFINITIONS
      .map(definition => {
        const idle = Boolean(findExistingFile(directory, definition.idle));
        const speaking = Boolean(definition.speaking && findExistingFile(directory, definition.speaking));
        return { name: definition.name, idle, speaking };
      })
      .filter(item => item.idle || item.speaking);
  }

  function scanSubCatalog(parentDirectory, depth = 0) {
    if (depth >= MAX_SUB_DEPTH) return [];
    const subsDirectory = path.join(parentDirectory, 'subs');
    if (!fs.existsSync(subsDirectory)) return [];

    let entries = [];
    try {
      entries = fs.readdirSync(subsDirectory, { withFileTypes: true });
    } catch {
      return [];
    }

    const result = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) continue;
      const subDirectory = path.join(subsDirectory, entry.name);
      const hasAnimation = Boolean(findExistingFile(subDirectory, 'animation') || findExistingFile(subDirectory, 'intro'));
      const hasIdle = Boolean(findExistingFile(subDirectory, 'idle'));
      if (!hasAnimation && !hasIdle) continue;
      result.push({
        name: entry.name,
        subs: scanSubCatalog(subDirectory, depth + 1)
      });
    }
    return result;
  }

  function emoteCapabilities(directory) {
    const emotesDirectory = path.join(directory || '', 'emotes');
    if (!directory || !fs.existsSync(emotesDirectory)) return [];

    let entries = [];
    try {
      entries = fs.readdirSync(emotesDirectory, { withFileTypes: true });
    } catch {
      return [];
    }

    const result = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) continue;
      const emoteDirectory = path.join(emotesDirectory, entry.name);
      const hasAnimation = Boolean(findExistingFile(emoteDirectory, 'animation'));
      const hasIdle = Boolean(findExistingFile(emoteDirectory, 'idle'));
      const emoteType = hasAnimation ? 1 : (hasIdle ? 2 : null);
      if (emoteType === null) continue;
      result.push({
        name: entry.name,
        emoteType,
        subs: scanSubCatalog(emoteDirectory)
      });
    }
    return result;
  }

  function installRoutes(app) {
    app.get('/api/actors/:actorId/capabilities', (req, res) => {
      const actor = authenticateActor(req, res);
      if (!actor) return;

      const model = modelDirectory(actor);
      if (!model || !fs.existsSync(model.directory)) {
        return res.status(404).json({ error: 'actor model assets not found' });
      }

      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({
        actorId: actor.id,
        model: actor.activeModel,
        defaultExpression: actor.defaultExpression,
        expressions: expressionCapabilities(model.directory),
        emotes: emoteCapabilities(model.directory)
      });
    });
  }

  const currentExpressFactory = require('express');
  function capabilitiesExpressFactory(...args) {
    const app = currentExpressFactory(...args);
    installRoutes(app);
    return app;
  }
  Object.assign(capabilitiesExpressFactory, currentExpressFactory);
  capabilitiesExpressFactory.application = currentExpressFactory.application;
  capabilitiesExpressFactory.request = currentExpressFactory.request;
  capabilitiesExpressFactory.response = currentExpressFactory.response;
  require.cache[require.resolve('express')].exports = capabilitiesExpressFactory;

  installed = true;
  console.log('  AI Actor capabilities endpoint enabled (sanitized expressions and emote catalog).');
}

module.exports = { installActorCapabilitiesMode };
