const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3197;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server startup timed out')), 15000);
    let output = '';

    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(`Control Panel:  http://localhost:${PORT}`)) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before startup with code ${code}\n${output}`));
    });
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
}

function websocketCommand() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}?type=streamerbot`);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('WebSocket command timed out'));
    }, 5000);

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'hello') {
        assert.strictEqual(message.apiVersion, '1.0');
        ws.send(JSON.stringify({
          type: 'command',
          id: 'ws-smoke-1',
          command: 'voice.set',
          args: { speaking: false, typing: true }
        }));
      } else if (message.type === 'command.result' && message.id === 'ws-smoke-1') {
        clearTimeout(timeout);
        assert.strictEqual(message.status, 'ok');
        assert.strictEqual(message.result.state.typing, true);
        ws.close();
        resolve();
      }
    });

    ws.on('error', reject);
  });
}

async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(child);

    let result = await request('/api/v1/health');
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.apiVersion, '1.0');

    result = await request('/api/v1/state/override', {
      method: 'PUT',
      body: JSON.stringify({ state: 'happy' })
    });
    assert.strictEqual(result.response.status, 200);
    assert.strictEqual(result.body.result.override, 'happy');

    result = await request('/api/v1/voice', {
      method: 'PUT',
      body: JSON.stringify({ speaking: true, typing: true })
    });
    assert.strictEqual(result.body.result.speaking, true);
    assert.strictEqual(result.body.result.typing, false);

    result = await request('/api/v1/state');
    assert.strictEqual(result.body.state.effectiveState, 'happy_speaking');

    const commandBody = {
      requestId: 'smoke-command-1',
      command: 'state.auto',
      args: {}
    };
    result = await request('/api/v1/commands', {
      method: 'POST',
      body: JSON.stringify(commandBody)
    });
    assert.strictEqual(result.body.result.state.override, null);

    result = await request('/api/v1/commands', {
      method: 'POST',
      body: JSON.stringify(commandBody)
    });
    assert.strictEqual(result.body.result.duplicate, true);

    result = await request('/api/v1/state/override', {
      method: 'PUT',
      body: JSON.stringify({ state: 'not-a-real-state' })
    });
    assert.strictEqual(result.response.status, 400);
    assert.strictEqual(result.body.error.code, 'invalid_state');

    await websocketCommand();
    console.log('API v1 smoke test passed.');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
