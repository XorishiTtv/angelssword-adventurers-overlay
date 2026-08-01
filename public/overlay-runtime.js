(() => {
  'use strict';

  if (window.__AS_OVERLAY_RUNTIME__) return;
  window.__AS_OVERLAY_RUNTIME__ = true;

  const BaseWebSocket = window.WebSocket;
  const baseFetch = window.fetch ? window.fetch.bind(window) : null;
  const ASSET_RETRY_DELAYS_MS = [0, 350, 1000, 2500];
  const EMPTY_RECOVERY_DELAY_MS = 1200;
  const DISCONNECTED_RECOVERY_DELAY_MS = 12000;
  const RECOVERY_WINDOW_MS = 2 * 60 * 1000;
  const MAX_RECOVERY_RELOADS = 3;
  const RECOVERY_STATE_KEY = 'as-overlay-runtime-recovery';

  const openSockets = new Set();
  let recoveryTimer = null;
  let mediaSyncFrame = null;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function requestDetails(input, init) {
    try {
      const source = input instanceof Request ? input.url : input;
      const url = new URL(String(source), location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      return { url, method };
    } catch {
      return null;
    }
  }

  function cloneInput(input) {
    if (!(input instanceof Request)) return input;
    try { return input.clone(); } catch { return input; }
  }

  if (baseFetch) {
    window.fetch = async function resilientOverlayFetch(input, init) {
      const details = requestDetails(input, init);
      const retryAssets = details?.method === 'GET'
        && details.url.origin === location.origin
        && details.url.pathname === '/api/assets';

      if (!retryAssets) return baseFetch(input, init);

      let lastResponse = null;
      let lastError = null;
      for (let index = 0; index < ASSET_RETRY_DELAYS_MS.length; index++) {
        if (ASSET_RETRY_DELAYS_MS[index] > 0) await wait(ASSET_RETRY_DELAYS_MS[index]);
        try {
          const response = await baseFetch(cloneInput(input), init);
          lastResponse = response;
          if (response.ok || response.status < 500 || index === ASSET_RETRY_DELAYS_MS.length - 1) {
            return response;
          }
        } catch (error) {
          lastError = error;
          if (index === ASSET_RETRY_DELAYS_MS.length - 1) throw error;
        }
      }

      if (lastResponse) return lastResponse;
      throw lastError || new Error('Overlay asset request failed.');
    };
  }

  function actorCredentials() {
    if (!location.pathname.endsWith('/actor-overlay.html')) return null;
    const normalize = value => String(value || '')
      .replace(/%5Cu0026/gi, '&')
      .replace(/\\u0026/gi, '&')
      .replace(/&amp;/gi, '&');
    const hash = new URLSearchParams(normalize(location.hash.replace(/^#/, '')));
    const query = new URLSearchParams(normalize(location.search.replace(/^\?/, '')));
    let actorId = hash.get('actor_id') || query.get('actor_id') || '';
    let actorToken = hash.get('actor_token') || query.get('actor_token') || '';
    const compact = hash.get('actor') || query.get('actor') || '';
    if ((!actorId || !actorToken) && compact) {
      const separator = compact.indexOf('.');
      if (separator > 0) {
        actorId ||= compact.slice(0, separator);
        actorToken ||= compact.slice(separator + 1);
      }
    }
    return actorId && actorToken ? { actorId, actorToken } : null;
  }

  async function restoreActiveActorEmote(socket) {
    const credentials = actorCredentials();
    if (!credentials || !baseFetch) return;

    try {
      const url = new URL(`/api/actors/${encodeURIComponent(credentials.actorId)}/emotes`, location.origin);
      url.searchParams.set('actor_token', credentials.actorToken);
      const response = await baseFetch(url.toString(), { cache: 'no-store' });
      if (!response.ok || socket.readyState !== BaseWebSocket.OPEN) return;
      const data = await response.json().catch(() => ({}));
      const activeName = data.activeEmote;
      const emote = Array.isArray(data.emotes)
        ? data.emotes.find(item => item?.name === activeName)
        : null;

      // Type 2 emotes represent a held state and should survive a transient socket
      // interruption. Type 1 emotes are one-shots and must not replay on reconnect.
      if (!emote || emote.emoteType !== 2 || socket.__asEmoteMessageSeen) return;
      await wait(300);
      if (socket.readyState !== BaseWebSocket.OPEN || socket.__asEmoteMessageSeen) return;
      socket.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ type: 'emote', action: 'trigger', name: emote.name, emote, recovered: true })
      }));
    } catch (error) {
      console.warn('[overlay-runtime] Could not restore the active actor emote:', error);
    }
  }

  function hasRenderableMedia() {
    return Boolean(document.querySelector('#overlay-container .asset-layer img, #overlay-container .asset-layer video'));
  }

  async function assetsAreAvailable() {
    if (!window.fetch) return false;
    try {
      const response = await window.fetch('/api/assets', { cache: 'no-store' });
      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return Boolean(data && typeof data === 'object' && Object.keys(data).length > 0);
    } catch {
      return false;
    }
  }

  function readRecoveryState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(RECOVERY_STATE_KEY) || '{}');
      return {
        startedAt: Number(parsed.startedAt || 0),
        count: Number(parsed.count || 0)
      };
    } catch {
      return { startedAt: 0, count: 0 };
    }
  }

  function reloadWithinBudget(reason) {
    const now = Date.now();
    const state = readRecoveryState();
    const next = now - state.startedAt > RECOVERY_WINDOW_MS
      ? { startedAt: now, count: 0 }
      : state;
    if (next.count >= MAX_RECOVERY_RELOADS) {
      console.warn('[overlay-runtime] Recovery reload limit reached; leaving the page running for manual inspection.');
      return false;
    }
    next.count += 1;
    try { sessionStorage.setItem(RECOVERY_STATE_KEY, JSON.stringify(next)); } catch { /* storage can be disabled */ }
    console.warn(`[overlay-runtime] Reloading after recovery: ${reason}`);
    location.reload();
    return true;
  }

  async function recoverEmptyOverlay(reason) {
    if (hasRenderableMedia()) return;
    if (await assetsAreAvailable()) reloadWithinBudget(reason);
  }

  function scheduleDisconnectedRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (openSockets.size === 0) recoverEmptyOverlay('server became reachable after a disconnected startup');
    }, DISCONNECTED_RECOVERY_DELAY_MS);
  }

  if (BaseWebSocket) {
    function RuntimeWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new BaseWebSocket(url)
        : new BaseWebSocket(url, protocols);

      socket.__asEmoteMessageSeen = false;
      socket.addEventListener('message', event => {
        if (typeof event.data !== 'string') return;
        try {
          const data = JSON.parse(event.data);
          if (data?.type === 'emote') socket.__asEmoteMessageSeen = true;
        } catch { /* ignore non-JSON traffic */ }
      });
      socket.addEventListener('open', () => {
        openSockets.add(socket);
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
        setTimeout(() => recoverEmptyOverlay('WebSocket reconnected after assets were unavailable'), EMPTY_RECOVERY_DELAY_MS);
        restoreActiveActorEmote(socket);
      });
      socket.addEventListener('close', () => {
        openSockets.delete(socket);
        if (openSockets.size === 0) scheduleDisconnectedRecovery();
      });
      return socket;
    }

    RuntimeWebSocket.prototype = BaseWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(RuntimeWebSocket, key, { value: BaseWebSocket[key] });
    }
    window.WebSocket = RuntimeWebSocket;
  }

  function cleanupRemovedMedia(node) {
    if (!(node instanceof Element)) return;
    const media = node.matches('video, audio') ? [node] : [...node.querySelectorAll('video, audio')];
    for (const element of media) {
      try { element.pause(); } catch { /* ignore */ }
      element.removeAttribute('src');
      try { element.load(); } catch { /* ignore */ }
    }
  }

  function synchronizeMedia() {
    mediaSyncFrame = null;
    const container = document.getElementById('overlay-container');
    if (!container) return;

    const hidden = document.hidden;
    const layers = [...container.querySelectorAll('.asset-layer')];
    for (const layer of layers) {
      const active = !hidden && layer.classList.contains('active');
      for (const video of layer.querySelectorAll('video')) {
        if (active) video.play().catch(() => {});
        else if (!video.paused) video.pause();
      }
    }

    if (!hidden && !container.querySelector('.asset-layer.active')) {
      const preferred = document.getElementById('layer-neutral_idle');
      const fallback = layers.find(layer => layer.querySelector('img, video'));
      const target = preferred?.querySelector('img, video') ? preferred : fallback;
      if (target) {
        target.classList.add('active');
        const video = target.querySelector('video');
        if (video) video.play().catch(() => {});
      }
    }
  }

  function scheduleMediaSync() {
    if (mediaSyncFrame !== null) return;
    mediaSyncFrame = requestAnimationFrame(synchronizeMedia);
  }

  function installMediaObserver() {
    const container = document.getElementById('overlay-container');
    if (!container) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const removed of record.removedNodes) cleanupRemovedMedia(removed);
      }
      scheduleMediaSync();
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    scheduleMediaSync();
  }

  document.addEventListener('visibilitychange', () => {
    scheduleMediaSync();
    if (!document.hidden && openSockets.size === 0) scheduleDisconnectedRecovery();
  });
  window.addEventListener('online', () => {
    if (openSockets.size === 0) scheduleDisconnectedRecovery();
  });
  window.addEventListener('pagehide', () => {
    for (const video of document.querySelectorAll('#overlay-container video')) {
      try { video.pause(); } catch { /* ignore */ }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMediaObserver, { once: true });
  } else {
    installMediaObserver();
  }
})();
