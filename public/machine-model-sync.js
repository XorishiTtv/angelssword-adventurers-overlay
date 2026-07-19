(() => {
  'use strict';

  // Loaded before control.js / overlay.js. Normal localhost mode has no machine
  // token, so this compatibility layer remains inactive there.
  const TOKEN_KEY = 'as-adventurer-machine-token';
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const machineToken = window.ASMachine?.token
    || hash.get('machine_token')
    || localStorage.getItem(TOKEN_KEY)
    || '';

  if (!machineToken || !window.fetch) return;

  // machine-client.js has already wrapped fetch with machine authentication.
  const authenticatedFetch = window.fetch.bind(window);
  let synchronization = null;

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

  async function readJson(response) {
    try {
      return await response.clone().json();
    } catch {
      return null;
    }
  }

  async function resolveActiveModel() {
    if (synchronization) return synchronization;

    synchronization = (async () => {
      const modelsResponse = await authenticatedFetch('/api/models');
      if (!modelsResponse.ok) return null;

      const data = await modelsResponse.json().catch(() => ({}));
      const models = Array.isArray(data.models) ? data.models : [];
      if (!models.length) return null;

      const activeExists = models.some(model => model.name === data.active);
      return activeExists ? data.active : models[0].name;
    })().finally(() => {
      synchronization = null;
    });

    return synchronization;
  }

  window.fetch = async function machineModelFetch(input, init) {
    const path = requestPath(input);
    const method = requestMethod(input, init);
    const response = await authenticatedFetch(input, init);

    if (path !== '/api/assets' || method !== 'GET' || !response.ok) return response;

    const assetData = await readJson(response);
    if (!assetData || typeof assetData !== 'object' || Object.keys(assetData).length > 0) {
      return response;
    }

    // The server manifest resolves stale registrations and emits model_change
    // after asset changes. This retry only covers an overlay request that named a
    // no-longer-valid model or raced the first manifest build.
    const modelName = await resolveActiveModel();
    if (!modelName) return response;

    try {
      const source = input instanceof Request ? input.url : input;
      const retryUrl = new URL(String(source), location.href);
      retryUrl.searchParams.set('model', modelName);

      if (input instanceof Request) {
        return authenticatedFetch(new Request(retryUrl.toString(), input), init);
      }
      return authenticatedFetch(retryUrl.toString(), init);
    } catch (error) {
      console.warn('[machine] Could not retry the model asset request:', error);
      return response;
    }
  };
})();
