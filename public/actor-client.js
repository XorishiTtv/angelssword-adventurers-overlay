(() => {
  'use strict';

  if (window.__AS_ACTOR_CLIENT__) return;
  window.__AS_ACTOR_CLIENT__ = true;

  const NativeWebSocket = window.WebSocket;
  const nativeFetch = window.fetch.bind(window);

  function credentialsFromLocation() {
    const pageUrl = new URL(location.href);
    const hash = new URLSearchParams(pageUrl.hash.replace(/^#/, ''));
    const actorId = hash.get('actor_id') || pageUrl.searchParams.get('actor_id') || '';
    const actorToken = hash.get('actor_token') || pageUrl.searchParams.get('actor_token') || '';

    if (pageUrl.searchParams.has('actor_id') || pageUrl.searchParams.has('actor_token')) {
      pageUrl.searchParams.delete('actor_id');
      pageUrl.searchParams.delete('actor_token');
      if (actorId) hash.set('actor_id', actorId);
      if (actorToken) hash.set('actor_token', actorToken);
      pageUrl.hash = hash.toString();
      history.replaceState(null, '', pageUrl);
    }

    return { actorId, actorToken };
  }

  const credentials = credentialsFromLocation();

  function showWarning(message) {
    const warning = document.createElement('div');
    warning.style.cssText = 'position:fixed;left:12px;top:12px;z-index:999999;padding:10px 14px;border-radius:8px;background:rgba(20,25,45,.94);color:#f4c15d;font:14px sans-serif;max-width:460px;';
    warning.textContent = message;
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(warning), { once: true });
  }

  if (!credentials.actorId || !credentials.actorToken) {
    showWarning('This actor overlay URL is missing its actor ID or token. Use the OBS URL returned when the actor is created.');
  }

  function authenticatedActorUrl(pathname) {
    const url = new URL(pathname, location.origin);
    url.searchParams.set('actor_token', credentials.actorToken);
    return url;
  }

  window.fetch = function actorFetch(input, init) {
    try {
      const source = input instanceof Request ? input.url : input;
      const url = new URL(String(source), location.href);
      if (url.origin === location.origin && url.pathname === '/api/assets') {
        const actorAssets = authenticatedActorUrl(`/api/actors/${encodeURIComponent(credentials.actorId)}/assets`);
        return nativeFetch(actorAssets.toString(), init);
      }
      return nativeFetch(input, init);
    } catch {
      return nativeFetch(input, init);
    }
  };

  if (NativeWebSocket) {
    function ActorWebSocket(url, protocols) {
      const actorUrl = new URL(String(url), location.href);
      if (location.protocol === 'https:' && actorUrl.protocol === 'ws:') actorUrl.protocol = 'wss:';
      actorUrl.searchParams.set('type', 'overlay');
      actorUrl.searchParams.set('actor_id', credentials.actorId);
      actorUrl.searchParams.set('actor_token', credentials.actorToken);
      return protocols === undefined
        ? new NativeWebSocket(actorUrl.toString())
        : new NativeWebSocket(actorUrl.toString(), protocols);
    }
    ActorWebSocket.prototype = NativeWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(ActorWebSocket, key, { value: NativeWebSocket[key] });
    }
    window.WebSocket = ActorWebSocket;
  }

  window.ASActor = {
    id: credentials.actorId,
    get hasCredentials() { return Boolean(credentials.actorId && credentials.actorToken); }
  };
})();
