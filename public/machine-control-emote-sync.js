(() => {
  'use strict';

  if (window.__AS_MACHINE_CONTROL_EMOTE_SYNC__) return;
  window.__AS_MACHINE_CONTROL_EMOTE_SYNC__ = true;

  if (location.pathname.endsWith('/overlay.html') || !window.fetch) return;

  const authenticatedFetch = window.fetch.bind(window);
  let emoteRecovery = null;

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
})();