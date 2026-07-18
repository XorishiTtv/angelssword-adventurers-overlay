from pathlib import Path

def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'marker not found in {path}: {old[:100]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')

OPS = [
    ('server.js', "const fs = require('fs');", "const fs = require('fs');\nconst { installAutomationApi } = require('./automation-api');"),
    ('server.js', 'const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 }); // 64KB max message', 'const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 }); // 64KB max message\nlet automationApi = { recordTracking() {} };'),
    ('server.js', "const clientType = ['overlay', 'control'].includes(rawType) ? rawType : 'overlay';", "const clientType = ['overlay', 'control', 'streamerbot'].includes(rawType) ? rawType : 'overlay';"),
    ('server.js', '  broadcastAll(data);\n}\n\n// Helper: get the score for a specific expression', '  automationApi.recordTracking(data);\n  broadcastAll(data);\n}\n\n// Helper: get the score for a specific expression'),
    ('server.js', '// ── Start (auto-find available port) ────────────────', "automationApi = installAutomationApi({\n  app,\n  wss,\n  clients,\n  broadcast,\n  broadcastAll,\n  assetsDir: ASSETS_DIR,\n  getPort: () => PORT,\n  getActiveModel: () => activeModel,\n  setActiveModel: (model) => { activeModel = model; },\n  getActiveEmote: () => activeEmote,\n  setActiveEmote: (emote) => { activeEmote = emote; },\n  getModelDir,\n  scanModelAssets,\n  scanEmotes,\n  getCurrentExpression: () => currentExpression,\n  getThresholds: () => ({\n    ...thresholds,\n    expressionHold: HYSTERESIS_MS,\n    exitBias: EXIT_BIAS\n  }),\n  setThresholds: (input = {}) => {\n    const isNum = (value, min, max) =>\n      typeof value === 'number' && Number.isFinite(value)\n      && value >= min && value <= max;\n\n    if (input.smile !== undefined) {\n      if (!isNum(input.smile, 0, 100)) throw Object.assign(new Error('invalid smile threshold'), { status: 400, code: 'invalid_threshold' });\n      thresholds.smile = input.smile;\n    }\n    if (input.frown !== undefined) {\n      if (!isNum(input.frown, 0, 100)) throw Object.assign(new Error('invalid frown threshold'), { status: 400, code: 'invalid_threshold' });\n      thresholds.frown = input.frown;\n    }\n    if (input.surprised !== undefined) {\n      if (!isNum(input.surprised, 0, 100)) throw Object.assign(new Error('invalid surprised threshold'), { status: 400, code: 'invalid_threshold' });\n      thresholds.surprised = input.surprised;\n    }\n    if (input.eyesClosed !== undefined) {\n      if (!isNum(input.eyesClosed, 0, 100)) throw Object.assign(new Error('invalid eyesClosed threshold'), { status: 400, code: 'invalid_threshold' });\n      thresholds.eyesClosed = input.eyesClosed;\n    }\n    if (input.expressionHold !== undefined) {\n      if (!isNum(input.expressionHold, 0, 30000)) throw Object.assign(new Error('invalid expressionHold'), { status: 400, code: 'invalid_threshold' });\n      HYSTERESIS_MS = input.expressionHold;\n    }\n    if (input.exitBias !== undefined) {\n      if (!isNum(input.exitBias, 0, 1)) throw Object.assign(new Error('invalid exitBias'), { status: 400, code: 'invalid_threshold' });\n      EXIT_BIAS = input.exitBias;\n    }\n\n    return {\n      ...thresholds,\n      expressionHold: HYSTERESIS_MS,\n      exitBias: EXIT_BIAS\n    };\n  }\n});\n\n// ── Start (auto-find available port) ────────────────"),
    ('public/overlay.js', '  function clearEmote(skipLayerClear = false) {\n    if (emoteGifTimeout) { clearTimeout(emoteGifTimeout); emoteGifTimeout = null; }', '  function clearEmote(skipLayerClear = false) {\n    const completedEmoteName = activeEmote?.name || null;\n    if (emoteGifTimeout) { clearTimeout(emoteGifTimeout); emoteGifTimeout = null; }'),
    ('public/overlay.js', "    } else {\n      // Immediate cleanup of old content (new emote is about to load)\n      emoteLayer.innerHTML = '';\n    }\n    console.log(`[emote] Cleared, returning to expression tracking`);", "    } else {\n      // Immediate cleanup of old content (new emote is about to load)\n      emoteLayer.innerHTML = '';\n    }\n    if (completedEmoteName && ws && ws.readyState === WebSocket.OPEN) {\n      ws.send(JSON.stringify({\n        type: 'emote_status',\n        action: 'completed',\n        name: completedEmoteName\n      }));\n    }\n    console.log(`[emote] Cleared, returning to expression tracking`);"),
    ('package.json', '  "version": "0.1.0",', '  "version": "0.2.0",'),
    ('package.json', '    "start": "node server.js",\n    "placeholders": "node generate-placeholders.js"', '    "start": "node server.js",\n    "test:api": "node test/api-v1-smoke.js",\n    "placeholders": "node generate-placeholders.js"'),
]

for path, old, new in OPS:
    replace_once(path, old, new)

print('Applied Streamer.bot API integration.')
