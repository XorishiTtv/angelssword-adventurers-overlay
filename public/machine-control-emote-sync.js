(() => {
  'use strict';

  if (window.__AS_MACHINE_CONTROL_EMOTE_SYNC__) return;
  window.__AS_MACHINE_CONTROL_EMOTE_SYNC__ = true;

  if (location.pathname.endsWith('/overlay.html') || !window.fetch) return;

  const COLLAPSE_KEY = 'as-adventurer-machine-assets-collapsed';
  const authenticatedFetch = window.fetch.bind(window);
  let emoteRecovery = null;
  let machineAssetsController = null;

  function requestPath(input) {
    try {
      const value = input instanceof Request ? input.url : input;
      return new URL(String(value), location.href).pathname;
    } catch {
      return '';
    }
  }

  function requestMethod(input, init) {
    return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
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

    toggle.addEventListener('click', () => {
      setCollapsed(!body.hidden, true);
    });

    const summaryObserver = new MutationObserver(updateSummary);
    for (const element of [card.querySelector('#machine-name'), card.querySelector('#machine-storage')]) {
      if (element) summaryObserver.observe(element, { childList: true, subtree: true, characterData: true });
    }

    machineAssetsController = {
      expandForActivity() {
        // Preserve the user's saved preference, but keep progress visible for the
        // remainder of this page session once an upload begins.
        setCollapsed(false, false);
      }
    };

    updateSummary();
    setCollapsed(readCollapsePreference(), false);
    return true;
  }

  function watchForMachineAssetsCard() {
    if (installMachineAssetsCollapse()) return;
    const observer = new MutationObserver(() => {
      if (installMachineAssetsCollapse()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function recoverEmotes(originalResponse) {
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

  window.fetch = async function machineControlEmoteFetch(input, init) {
    const path = requestPath(input);
    const method = requestMethod(input, init);

    if (path === '/api/machine/assets' && method === 'PUT') {
      machineAssetsController?.expandForActivity();
    }

    const response = await authenticatedFetch(input, init);

    if (response.ok && path === '/api/emotes' && method === 'GET') {
      return recoverEmotes(response);
    }

    // Do not reload the control page after model selection or asset changes.
    // control.js already receives the machine-scoped model_change WebSocket event
    // and refreshes its emote list. Keeping this page alive preserves active
    // webcam MediaStreams, microphone tracks, AudioContext, and worker timers.
    return response;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForMachineAssetsCard, { once: true });
  } else {
    watchForMachineAssetsCard();
  }
})();
