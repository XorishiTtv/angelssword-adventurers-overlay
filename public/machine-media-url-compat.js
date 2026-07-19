(() => {
  'use strict';

  if (window.__AS_MACHINE_MEDIA_COMPAT__) return;
  window.__AS_MACHINE_MEDIA_COMPAT__ = true;

  // The original overlay detects media types with string checks such as
  // `url.endsWith('.webm')` and `url.split('.').pop()`. Machine-scoped asset
  // URLs carry an authentication query string, so those checks would otherwise
  // see `.webm?machine_token=...` and create an <img> for a video file.
  //
  // Add a fragment containing the real extension. Fragments are never sent to
  // the server, so the authenticated request remains unchanged while the
  // existing client sees a URL ending in `.webm`, `.png`, etc. Apply the same
  // normalization to API responses and emote payloads received by WebSocket.

  const authenticatedFetch = window.fetch ? window.fetch.bind(window) : null;
  const AuthenticatedWebSocket = window.WebSocket;
  const MEDIA_EXTENSIONS = new Set([
    'webm', 'webp', 'gif', 'png', 'mp4',
    'mp3', 'wav', 'ogg', 'm4a'
  ]);

  function requestPath(input) {
    try {
      const value = input instanceof Request ? input.url : input;
      return new URL(String(value), location.href).pathname;
    } catch {
      return '';
    }
  }

  function addExtensionHint(value) {
    if (typeof value !== 'string' || !value.includes('/machine-assets/')) return value;

    try {
      const url = new URL(value, location.href);
      const fileName = url.pathname.split('/').pop() || '';
      const dotIndex = fileName.lastIndexOf('.');
      if (dotIndex < 0) return value;

      const extension = fileName.slice(dotIndex + 1).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(extension)) return value;

      url.hash = `.${extension}`;
      return url.toString();
    } catch {
      return value;
    }
  }

  function rewriteMediaUrls(value) {
    if (typeof value === 'string') return addExtensionHint(value);
    if (Array.isArray(value)) return value.map(rewriteMediaUrls);
    if (!value || typeof value !== 'object') return value;

    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = rewriteMediaUrls(child);
    }
    return result;
  }

  async function rewriteJsonResponse(response) {
    const data = await response.clone().json();
    const rewritten = rewriteMediaUrls(data);
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.delete('Content-Length');

    return new Response(JSON.stringify(rewritten), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  if (authenticatedFetch) {
    window.fetch = async function machineMediaFetch(input, init) {
      const response = await authenticatedFetch(input, init);
      const path = requestPath(input);

      if (!response.ok || (path !== '/api/assets' && path !== '/api/emotes')) {
        return response;
      }

      try {
        return await rewriteJsonResponse(response);
      } catch (error) {
        console.warn('[machine] Could not normalize protected media URLs:', error);
        return response;
      }
    };
  }

  function rewriteMessageEvent(event) {
    if (!event || typeof event.data !== 'string') return event;

    try {
      const parsed = JSON.parse(event.data);
      const rewritten = rewriteMediaUrls(parsed);
      return new MessageEvent('message', {
        data: JSON.stringify(rewritten),
        origin: event.origin,
        lastEventId: event.lastEventId,
        source: event.source,
        ports: event.ports
      });
    } catch {
      return event;
    }
  }

  // Emote trigger responses reach the overlay over WebSocket rather than fetch,
  // so normalize message payloads before overlay.js inspects their extensions.
  if (AuthenticatedWebSocket) {
    function MediaCompatibleWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new AuthenticatedWebSocket(url)
        : new AuthenticatedWebSocket(url, protocols);

      let assignedMessageHandler = null;
      const wrappedListeners = new WeakMap();
      const nativeAddEventListener = socket.addEventListener.bind(socket);
      const nativeRemoveEventListener = socket.removeEventListener.bind(socket);

      nativeAddEventListener('message', event => {
        if (!assignedMessageHandler) return;
        const normalizedEvent = rewriteMessageEvent(event);
        if (typeof assignedMessageHandler === 'function') {
          assignedMessageHandler.call(socket, normalizedEvent);
        } else if (typeof assignedMessageHandler.handleEvent === 'function') {
          assignedMessageHandler.handleEvent(normalizedEvent);
        }
      });

      Object.defineProperty(socket, 'onmessage', {
        configurable: true,
        enumerable: true,
        get() { return assignedMessageHandler; },
        set(listener) { assignedMessageHandler = listener; }
      });

      socket.addEventListener = function compatibleAddEventListener(type, listener, options) {
        if (type !== 'message' || !listener) {
          return nativeAddEventListener(type, listener, options);
        }

        const wrapped = event => {
          const normalizedEvent = rewriteMessageEvent(event);
          if (typeof listener === 'function') listener.call(socket, normalizedEvent);
          else if (typeof listener.handleEvent === 'function') listener.handleEvent(normalizedEvent);
        };
        wrappedListeners.set(listener, wrapped);
        return nativeAddEventListener(type, wrapped, options);
      };

      socket.removeEventListener = function compatibleRemoveEventListener(type, listener, options) {
        const wrapped = type === 'message' ? wrappedListeners.get(listener) : null;
        return nativeRemoveEventListener(type, wrapped || listener, options);
      };

      return socket;
    }

    MediaCompatibleWebSocket.prototype = AuthenticatedWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
      Object.defineProperty(MediaCompatibleWebSocket, key, { value: AuthenticatedWebSocket[key] });
    }
    window.WebSocket = MediaCompatibleWebSocket;
  }
})();
