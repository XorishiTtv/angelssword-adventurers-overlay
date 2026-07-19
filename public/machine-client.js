(() => {
  'use strict';

  const TOKEN_KEY = 'as-adventurer-machine-token';
  const nativeFetch = window.fetch.bind(window);
  const NativeWebSocket = window.WebSocket;

  function tokenFromLocation() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fromHash = hash.get('machine_token');
    const url = new URL(location.href);
    const fromQuery = url.searchParams.get('machine_token');
    const token = fromHash || fromQuery || localStorage.getItem(TOKEN_KEY) || '';

    if (fromQuery) {
      url.searchParams.delete('machine_token');
      const nextHash = new URLSearchParams(url.hash.replace(/^#/, ''));
      nextHash.set('machine_token', fromQuery);
      url.hash = nextHash.toString();
      history.replaceState(null, '', url);
    }
    if (token) localStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  let machineToken = tokenFromLocation();

  function addTokenToUrl(value) {
    const url = new URL(String(value), location.href);
    if (machineToken && url.origin === location.origin) {
      url.searchParams.set('machine_token', machineToken);
    }
    return url;
  }

  window.fetch = function machineFetch(input, init) {
    try {
      const sourceUrl = input instanceof Request ? input.url : input;
      const url = addTokenToUrl(sourceUrl);
      if (input instanceof Request) {
        return nativeFetch(new Request(url.toString(), input), init);
      }
      return nativeFetch(url.toString(), init);
    } catch {
      return nativeFetch(input, init);
    }
  };

  if (NativeWebSocket) {
    function MachineWebSocket(url, protocols) {
      const secureUrl = new URL(String(url), location.href);
      if (location.protocol === 'https:' && secureUrl.protocol === 'ws:') secureUrl.protocol = 'wss:';
      if (machineToken && secureUrl.host === location.host) {
        secureUrl.searchParams.set('machine_token', machineToken);
      }
      return protocols === undefined
        ? new NativeWebSocket(secureUrl.toString())
        : new NativeWebSocket(secureUrl.toString(), protocols);
    }
    MachineWebSocket.prototype = NativeWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(MachineWebSocket, key, { value: NativeWebSocket[key] });
    }
    window.WebSocket = MachineWebSocket;
  }

  function authorizedOverlayUrl() {
    const url = new URL('/overlay.html', location.origin);
    const hash = new URLSearchParams();
    if (machineToken) hash.set('machine_token', machineToken);
    url.hash = hash.toString();
    return url.toString();
  }

  function saveTokenAndReload(token) {
    machineToken = String(token || '').trim();
    if (!machineToken) return;
    localStorage.setItem(TOKEN_KEY, machineToken);
    const url = new URL(location.href);
    url.searchParams.delete('machine_token');
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    hash.set('machine_token', machineToken);
    url.hash = hash.toString();
    location.replace(url.toString());
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function setMessage(element, text, isError = false) {
    element.textContent = text;
    element.style.color = isError ? '#f4c15d' : '';
  }

  function installSecureMediaGuard() {
    if (window.isSecureContext && navigator.mediaDevices) return;
    const message = 'Camera and microphone require the trusted HTTPS LAN address.';
    document.addEventListener('click', event => {
      const target = event.target?.closest?.('#btn-start-webcam, #btn-start-mic, #mic-select');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target.id === 'btn-start-webcam') target.textContent = message;
      const micButton = document.getElementById('btn-start-mic');
      const micSelect = document.getElementById('mic-select');
      if (micButton) micButton.textContent = message;
      if (micSelect) micSelect.innerHTML = '<option>HTTPS certificate required</option>';
    }, true);
  }

  function renderOverlayAuthWarning(message) {
    const warning = document.createElement('div');
    warning.style.cssText = 'position:fixed;left:12px;top:12px;z-index:999999;padding:10px 14px;border-radius:8px;background:rgba(20,25,45,.92);color:#f4c15d;font:14px sans-serif;max-width:420px;';
    warning.textContent = message;
    document.body.appendChild(warning);
  }

  function renderRegistration() {
    const layer = document.createElement('div');
    layer.id = 'machine-registration-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#11172b;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Outfit,Arial,sans-serif;color:#eef2ff;';
    layer.innerHTML = `
      <div style="width:min(560px,100%);background:#18223d;border:1px solid #33405e;border-radius:14px;padding:26px;box-shadow:0 24px 60px rgba(0,0,0,.4)">
        <h1 style="font-family:Cinzel,serif;font-size:24px;margin:0 0 10px">Register this machine</h1>
        <p style="color:#aab5cf;line-height:1.5;margin:0 0 20px">Each LAN machine receives its own private asset folder. Its token is required by the control panel, OBS overlay, upload API, and protected asset files.</p>
        <label style="display:block;margin-bottom:6px">Machine name</label>
        <input id="machine-register-name" value="Overlay PC" maxlength="60" style="width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #445272;background:#0f1830;color:#fff;margin-bottom:10px">
        <button id="machine-register-button" style="width:100%;padding:12px;border:0;border-radius:8px;background:#e0b84d;color:#171717;font-weight:700;cursor:pointer">Create machine token</button>
        <div id="machine-register-message" style="min-height:22px;margin:10px 0 18px;color:#aab5cf"></div>
        <div style="border-top:1px solid #33405e;padding-top:18px">
          <label style="display:block;margin-bottom:6px">Already registered? Paste its token</label>
          <input id="machine-existing-token" type="password" autocomplete="off" placeholder="Machine token" style="width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #445272;background:#0f1830;color:#fff;margin-bottom:10px">
          <button id="machine-use-token" style="width:100%;padding:11px;border-radius:8px;border:1px solid #56637f;background:#202b48;color:#fff;font-weight:600;cursor:pointer">Use existing token</button>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const message = layer.querySelector('#machine-register-message');
    layer.querySelector('#machine-register-button').addEventListener('click', async () => {
      const name = layer.querySelector('#machine-register-name').value.trim();
      if (!name) return setMessage(message, 'Enter a machine name.', true);
      setMessage(message, 'Registering...');
      try {
        const response = await nativeFetch('/api/machine/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed');
        saveTokenAndReload(data.token);
      } catch (error) {
        setMessage(message, error.message, true);
      }
    });

    layer.querySelector('#machine-use-token').addEventListener('click', () => {
      const token = layer.querySelector('#machine-existing-token').value.trim();
      if (!token) return setMessage(message, 'Paste the existing machine token.', true);
      saveTokenAndReload(token);
    });
  }

  async function uploadOne(file, relativePath, progress) {
    const response = await fetch(`/api/machine/assets?path=${encodeURIComponent(relativePath)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Upload failed: ${relativePath}`);
    setMessage(progress, `Uploaded ${relativePath}`);
  }

  function safeDestination(value) {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  async function injectMachineCard(status) {
    const column = document.querySelector('.main-grid .column:last-child') || document.querySelector('.main-grid .column');
    if (!column || document.getElementById('machine-assets-card')) return;

    const card = document.createElement('div');
    card.className = 'card card-highlight';
    card.id = 'machine-assets-card';
    card.innerHTML = `
      <div class="card-header"><h2>🖥️ Machine Assets</h2></div>
      <div class="card-body">
        <div class="help-text" style="margin-bottom:10px"><strong id="machine-name"></strong><br><span id="machine-id"></span></div>
        <div class="input-group">
          <label>Machine token</label>
          <div class="input-row">
            <input id="machine-token-display" type="password" readonly>
            <button class="btn btn-secondary" id="machine-copy-token">Copy</button>
          </div>
        </div>
        <div class="input-group" style="margin-top:12px">
          <label>Upload a complete model folder</label>
          <input id="machine-folder-upload" type="file" webkitdirectory multiple>
          <div class="help-text">The selected top-level folder becomes the model name. Its internal emote folders are preserved.</div>
        </div>
        <div class="input-group" style="margin-top:12px">
          <label>Upload files to a destination folder</label>
          <input id="machine-destination" placeholder="MyCharacter or MyCharacter/emotes/wave">
          <input id="machine-file-upload" type="file" multiple accept=".webm,.webp,.gif,.png,.mp4,.mp3,.wav,.ogg,.m4a" style="margin-top:8px">
        </div>
        <div id="machine-upload-progress" class="help-text" style="margin-top:10px"></div>
        <div class="help-text" style="margin-top:12px"><span id="machine-storage"></span></div>
        <details style="margin-top:10px"><summary style="cursor:pointer">Manage uploaded files</summary><div id="machine-file-list" style="margin-top:8px;max-height:260px;overflow:auto"></div></details>
      </div>`;
    column.insertBefore(card, column.firstChild);

    card.querySelector('#machine-name').textContent = status.machine.name;
    card.querySelector('#machine-id').textContent = `Registration: ${status.machine.id}`;
    card.querySelector('#machine-token-display').value = machineToken;
    const progress = card.querySelector('#machine-upload-progress');

    card.querySelector('#machine-copy-token').addEventListener('click', async event => {
      await navigator.clipboard.writeText(machineToken);
      event.currentTarget.textContent = 'Copied!';
      setTimeout(() => { event.currentTarget.textContent = 'Copy'; }, 1500);
    });

    const uploadFiles = async entries => {
      if (!entries.length) return;
      try {
        for (let index = 0; index < entries.length; index++) {
          const entry = entries[index];
          setMessage(progress, `Uploading ${index + 1}/${entries.length}: ${entry.path}`);
          await uploadOne(entry.file, entry.path, progress);
        }
        setMessage(progress, `Finished uploading ${entries.length} file(s). Models refresh automatically.`);
        await refreshMachineFiles(card);
      } catch (error) {
        setMessage(progress, error.message, true);
      }
    };

    card.querySelector('#machine-folder-upload').addEventListener('change', event => {
      const entries = [...event.target.files].map(file => ({
        file,
        path: file.webkitRelativePath || file.name
      }));
      uploadFiles(entries);
      event.target.value = '';
    });

    card.querySelector('#machine-file-upload').addEventListener('change', event => {
      const destination = safeDestination(card.querySelector('#machine-destination').value);
      if (!destination) {
        setMessage(progress, 'Enter a destination folder before selecting loose files.', true);
        event.target.value = '';
        return;
      }
      const entries = [...event.target.files].map(file => ({ file, path: `${destination}/${file.name}` }));
      uploadFiles(entries);
      event.target.value = '';
    });

    await refreshMachineFiles(card, status);
  }

  async function refreshMachineFiles(card, knownStatus = null) {
    const [statusResponse, filesResponse] = await Promise.all([
      knownStatus ? Promise.resolve({ ok: true, json: async () => knownStatus }) : fetch('/api/machine/status'),
      fetch('/api/machine/files')
    ]);
    const status = await statusResponse.json();
    const filesData = await filesResponse.json();
    card.querySelector('#machine-storage').textContent = `${status.fileCount} files · ${formatBytes(status.storageBytes)} used`;
    const list = card.querySelector('#machine-file-list');
    list.innerHTML = '';

    if (!filesData.files?.length) {
      list.innerHTML = '<div class="help-text">No machine assets uploaded yet.</div>';
      return;
    }

    for (const file of filesData.files) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);';
      const label = document.createElement('div');
      label.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px;';
      label.textContent = `${file.path} (${formatBytes(file.size)})`;
      const remove = document.createElement('button');
      remove.className = 'btn btn-small';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!confirm(`Delete ${file.path}?`)) return;
        const response = await fetch(`/api/machine/assets?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' });
        if (response.ok) await refreshMachineFiles(card);
      });
      row.append(label, remove);
      list.appendChild(row);
    }
  }

  function updateObsUrl() {
    const obsUrl = authorizedOverlayUrl();
    const element = document.getElementById('obs-url');
    if (element) element.textContent = obsUrl;
  }

  async function initializeMachine() {
    installSecureMediaGuard();
    const isOverlay = location.pathname.endsWith('/overlay.html');

    if (!machineToken) {
      if (isOverlay) renderOverlayAuthWarning('This overlay URL is missing its machine token. Copy the registered OBS URL from the control panel.');
      else renderRegistration();
      return;
    }

    try {
      const response = await fetch('/api/machine/status');
      const status = await response.json().catch(() => ({}));
      if (!response.ok || !status.authenticated) throw new Error(status.error || 'Invalid machine token');
      if (!isOverlay) {
        updateObsUrl();
        await injectMachineCard(status);
      }
    } catch (error) {
      if (isOverlay) renderOverlayAuthWarning(`Machine token rejected: ${error.message}`);
      else renderRegistration();
    }
  }

  window.ASMachine = {
    get token() { return machineToken; },
    overlayUrl: authorizedOverlayUrl,
    clearRegistration() {
      localStorage.removeItem(TOKEN_KEY);
      machineToken = '';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMachine, { once: true });
  } else {
    initializeMachine();
  }
})();
