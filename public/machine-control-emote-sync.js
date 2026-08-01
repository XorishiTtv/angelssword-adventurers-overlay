(() => {
  'use strict';

  if (window.__AS_MACHINE_CONTROL_EMOTE_SYNC__) return;
  window.__AS_MACHINE_CONTROL_EMOTE_SYNC__ = true;

  if (!window.fetch) return;

  const COLLAPSE_KEY = 'as-adventurer-machine-assets-collapsed';
  const GLOBAL_PREFIX = 'global:';
  const PRIVATE_PREFIX = 'private:';
  const authenticatedFetch = window.fetch.bind(window);
  const AuthenticatedWebSocket = window.WebSocket;
  const isOverlay = location.pathname.endsWith('/overlay.html');

  let emoteRecovery = null;
  let machineAssetsController = null;
  let selectedGlobal = undefined;
  let lastModelsData = null;
  let modelRefresh = null;

  function requestUrl(input) {
    try {
      const value = input instanceof Request ? input.url : input;
      return new URL(String(value), location.href);
    } catch {
      return null;
    }
  }

  function requestPath(input) {
    return requestUrl(input)?.pathname || '';
  }

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  }

  async function requestJsonBody(input, init) {
    try {
      const body = init?.body;
      if (typeof body === 'string') return JSON.parse(body);
      if (input instanceof Request) return await input.clone().json();
    } catch { /* invalid or non-JSON body */ }
    return {};
  }

  function jsonResponse(data, sourceResponse) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(data), {
      status: sourceResponse?.status || 200,
      statusText: sourceResponse?.statusText || 'OK',
      headers
    });
  }

  function privateId(name) {
    return `${PRIVATE_PREFIX}${name || 'Default'}`;
  }

  function privateName(model) {
    return String(model || '').startsWith(PRIVATE_PREFIX)
      ? String(model).slice(PRIVATE_PREFIX.length)
      : String(model || '');
  }

  function isGlobalModel(model) {
    return String(model || '').startsWith(GLOBAL_PREFIX);
  }

  async function fetchGlobalModels() {
    const response = await authenticatedFetch('/api/global/models');
    if (!response.ok) return { models: [], active: null, revision: 0 };
    const data = await response.json().catch(() => ({}));
    const models = Array.isArray(data.models) ? data.models : [];
    const active = models.some(model => model.name === data.active) ? data.active : null;
    selectedGlobal = active;
    return { ...data, models, active };
  }

  async function ensureGlobalSelection() {
    if (selectedGlobal !== undefined) return selectedGlobal;
    const data = await fetchGlobalModels().catch(() => ({ active: null }));
    selectedGlobal = data.active || null;
    return selectedGlobal;
  }

  function applyGroupedModels(data) {
    if (isOverlay || !data || !Array.isArray(data.models)) return;
    const select = document.getElementById('model-select');
    if (!select) return;

    const groups = [
      { scope: 'global', label: 'Global Models' },
      { scope: 'private', label: 'My Models' }
    ];

    select.innerHTML = '';
    for (const groupInfo of groups) {
      const models = data.models.filter(model => model.scope === groupInfo.scope);
      if (!models.length) continue;
      const group = document.createElement('optgroup');
      group.label = groupInfo.label;
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = `${model.displayName || model.name} (${model.assetCount} assets)`;
        option.selected = model.name === data.active;
        group.appendChild(option);
      }
      select.appendChild(group);
    }

    if (!data.models.length) {
      select.innerHTML = '<option value="">No models found</option>';
    }

    const info = document.getElementById('model-info');
    if (info) {
      const globalCount = data.models.filter(model => model.scope === 'global').length;
      const privateCount = data.models.filter(model => model.scope === 'private').length;
      info.textContent = `${globalCount} global · ${privateCount} private`;
    }
  }

  function scheduleGroupedModels(data) {
    lastModelsData = data;
    setTimeout(() => applyGroupedModels(lastModelsData), 0);
  }

  async function combinedModelsResponse(input, init) {
    const [privateResponse, globalData] = await Promise.all([
      authenticatedFetch(input, init),
      fetchGlobalModels().catch(() => ({ models: [], active: null, revision: 0 }))
    ]);
    if (!privateResponse.ok) return privateResponse;

    const privateData = await privateResponse.json().catch(() => ({}));
    const privateModels = Array.isArray(privateData.models)
      ? privateData.models.map(model => ({
          ...model,
          name: privateId(model.name),
          displayName: model.name,
          scope: 'private'
        }))
      : [];
    const globalModels = globalData.models.map(model => ({
      ...model,
      displayName: model.displayName || String(model.name).slice(GLOBAL_PREFIX.length),
      scope: 'global'
    }));
    const active = globalData.active || privateId(privateData.active || privateModels[0]?.displayName || 'Default');
    const data = {
      ...privateData,
      models: [...globalModels, ...privateModels],
      active,
      privateRevision: privateData.revision || 0,
      globalRevision: globalData.revision || 0
    };
    scheduleGroupedModels(data);
    return jsonResponse(data, privateResponse);
  }

  async function selectModel(input, init) {
    const body = await requestJsonBody(input, init);
    const model = String(body.model || '');
    if (!model) return authenticatedFetch(input, init);

    if (isGlobalModel(model)) {
      const response = await authenticatedFetch('/api/global/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (response.ok) selectedGlobal = model;
      return response;
    }

    await authenticatedFetch('/api/global/models/select', { method: 'DELETE' }).catch(() => null);
    selectedGlobal = null;
    return authenticatedFetch('/api/models/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: privateName(model) })
    });
  }

  async function routeAssets(input, init) {
    const url = requestUrl(input);
    if (!url) return authenticatedFetch(input, init);
    const requested = url.searchParams.get('model');

    if (isGlobalModel(requested)) {
      return authenticatedFetch(`/api/global/assets?model=${encodeURIComponent(requested)}`);
    }

    if (requested?.startsWith(PRIVATE_PREFIX)) {
      url.searchParams.set('model', privateName(requested));
      return authenticatedFetch(url.toString(), init);
    }

    if (!requested && await ensureGlobalSelection()) {
      return authenticatedFetch(`/api/global/assets?model=${encodeURIComponent(selectedGlobal)}`);
    }

    return authenticatedFetch(input, init);
  }

  async function recoverPrivateEmotes(originalResponse) {
    if (emoteRecovery) return emoteRecovery;

    emoteRecovery = (async () => {
      const current = await originalResponse.clone().json().catch(() => null);
      if (Array.isArray(current) && current.length > 0) return originalResponse;

      const modelsResponse = await authenticatedFetch('/api/models');
      if (!modelsResponse.ok) return originalResponse;
      const modelsData = await modelsResponse.json().catch(() => ({}));
      const models = Array.isArray(modelsData.models) ? modelsData.models : [];
      if (!models.length) return originalResponse;

      const selected = models.some(model => model.name === modelsData.active)
        ? modelsData.active
        : models[0].name;
      if (!selected) return originalResponse;

      const selectResponse = await authenticatedFetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected })
      });
      if (!selectResponse.ok) return originalResponse;
      return authenticatedFetch('/api/emotes');
    })().finally(() => {
      emoteRecovery = null;
    });

    return emoteRecovery;
  }

  async function routeEmotes(input, init, path, method) {
    const globalModel = await ensureGlobalSelection();
    if (globalModel) {
      const endpoint = {
        '/api/emotes': '/api/global/emotes',
        '/api/emote/trigger': '/api/global/emote/trigger',
        '/api/emote/release': '/api/global/emote/release',
        '/api/emote/sub': '/api/global/emote/sub'
      }[path];
      return authenticatedFetch(endpoint, init);
    }

    const response = await authenticatedFetch(input, init);
    if (response.ok && path === '/api/emotes' && method === 'GET') {
      return recoverPrivateEmotes(response);
    }
    return response;
  }

  async function refreshModelsUi() {
    if (isOverlay) return;
    if (modelRefresh) return modelRefresh;
    modelRefresh = (async () => {
      const response = await window.fetch('/api/models');
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (data) applyGroupedModels(data);
    })().finally(() => {
      modelRefresh = null;
    });
    return modelRefresh;
  }

  window.fetch = async function machineGlobalModelFetch(input, init) {
    const path = requestPath(input);
    const method = requestMethod(input, init);

    if (path === '/api/machine/assets' && method === 'PUT') {
      machineAssetsController?.expandForActivity();
    }

    if (path === '/api/models' && method === 'GET') {
      return combinedModelsResponse(input, init);
    }
    if (path === '/api/models/select' && method === 'POST') {
      return selectModel(input, init);
    }
    if (path === '/api/assets' && method === 'GET') {
      return routeAssets(input, init);
    }
    if (
      (path === '/api/emotes' && method === 'GET') ||
      (path === '/api/emote/trigger' && method === 'POST') ||
      (path === '/api/emote/release' && method === 'POST') ||
      (path === '/api/emote/sub' && method === 'POST')
    ) {
      return routeEmotes(input, init, path, method);
    }

    return authenticatedFetch(input, init);
  };

  if (AuthenticatedWebSocket) {
    function GlobalModelWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new AuthenticatedWebSocket(url)
        : new AuthenticatedWebSocket(url, protocols);
      socket.addEventListener('message', event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'model_change') {
            selectedGlobal = isGlobalModel(data.model) ? data.model : null;
          }
          if (data.type === 'global_assets_changed') refreshModelsUi();
        } catch { /* ignore non-JSON messages */ }
      });
      return socket;
    }
    GlobalModelWebSocket.prototype = AuthenticatedWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(GlobalModelWebSocket, key, { value: AuthenticatedWebSocket[key] });
    }
    window.WebSocket = GlobalModelWebSocket;
  }

  function readCollapsePreference() {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeCollapsePreference(collapsed) {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch { /* storage can be unavailable in restricted browser contexts */ }
  }

  function installMachineAssetsCollapse() {
    const card = document.getElementById('machine-assets-card');
    if (!card) return false;
    if (card.dataset.asCollapsible === '1') return true;

    const header = card.querySelector('.card-header');
    const body = card.querySelector('.card-body');
    const title = header?.querySelector('h2');
    if (!header || !body || !title) return false;

    card.dataset.asCollapsible = '1';
    body.id = body.id || 'machine-assets-card-body';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '12px';

    const heading = document.createElement('div');
    heading.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px;';
    header.insertBefore(heading, title);
    heading.appendChild(title);

    const summary = document.createElement('div');
    summary.className = 'help-text';
    summary.style.cssText = 'font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;';
    heading.appendChild(summary);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-small btn-secondary';
    toggle.setAttribute('aria-controls', body.id);
    toggle.style.cssText = 'flex:0 0 auto;min-width:36px;font-size:18px;line-height:1;';
    header.appendChild(toggle);

    const updateSummary = () => {
      const machineName = card.querySelector('#machine-name')?.textContent?.trim() || '';
      const storage = card.querySelector('#machine-storage')?.textContent?.trim() || '';
      summary.textContent = [machineName, storage].filter(Boolean).join(' · ') || 'Machine storage';
    };

    const setCollapsed = (collapsed, persist = false) => {
      body.hidden = collapsed;
      toggle.textContent = collapsed ? '+' : '−';
      toggle.title = collapsed ? 'Expand Machine Assets' : 'Minimize Machine Assets';
      toggle.setAttribute('aria-label', toggle.title);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (persist) writeCollapsePreference(collapsed);
    };

    toggle.addEventListener('click', () => setCollapsed(!body.hidden, true));

    const summaryObserver = new MutationObserver(updateSummary);
    for (const element of [card.querySelector('#machine-name'), card.querySelector('#machine-storage')]) {
      if (element) summaryObserver.observe(element, { childList: true, subtree: true, characterData: true });
    }

    machineAssetsController = {
      expandForActivity() {
        setCollapsed(false, false);
      }
    };

    updateSummary();
    setCollapsed(readCollapsePreference(), false);
    return true;
  }

  function watchForMachineAssetsCard() {
    if (isOverlay || installMachineAssetsCollapse()) return;
    const observer = new MutationObserver(() => {
      if (installMachineAssetsCollapse()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForMachineAssetsCard, { once: true });
  } else {
    watchForMachineAssetsCard();
  }
})();
