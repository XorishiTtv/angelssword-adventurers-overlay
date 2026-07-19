(() => {
  'use strict';

  // The existing overlay detects media types with string checks such as
  // `url.endsWith('.webm')` and `url.split('.').pop()`. Machine-scoped asset
  // URLs must carry an authentication query string, so those checks otherwise
  // see `.webm?machine_token=...` and create an <img> for a video file.
  //
  // Add a fragment containing the real extension. Fragments are never sent to
  // the server, so the authenticated HTTP request remains unchanged while the
  // existing client correctly sees the URL ending in `.webm`, `.png`, etc.

  if (!window.fetch) return;

  const nativeFetch = window.fetch.bind(window);
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

  window.fetch = async function machineMediaFetch(input, init) {
    const response = await nativeFetch(input, init);
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
})();
