(() => {
  'use strict';

  // This script is loaded before control.js / overlay.js. In normal localhost
  // mode there is no machine token, so it intentionally does nothing.
  const TOKEN_KEY = 'as-adventurer-machine-token';
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const machineToken = window.ASMachine?.token
    || hash.get('machine_token')
    || localStorage.getItem(TOKEN_KEY)
    || '';

  if (!machineToken || !window.fetch) return;

  // machine-client.js has already wrapped fetch with machine authentication.
  // Keep that authenticated implementation as our non-recursive transport.
  const authenticatedFetch = window.fetch.bind(window);
  const isOverlay = location.pathname.endsWith('/overlay.html');
  let synchronization = null;
  let uploadTimer = null;
  let lastOverlayFileCount = null;

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

  async function synchronizeActiveModel({ broadcast = true } = {}) {
    if (synchronization) return synchronization;

    synchronization = (async () => {
      const modelsResponse = await authenticatedFetch('/api/models');
      if (!modelsResponse.ok) return null;

      const data = await modelsResponse.json().catch(() => ({}));
      const models = Array.isArray(data.models) ? data.models : [];
      if (!models.length) return null;

      const activeExists = models.some(model => model.name === data.active);
      const modelName = activeExists ? data.active : models[0].name;
      if (!modelName) return null;

      if (broadcast) {
        const selectionResponse = await authenticatedFetch('/api/models/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName })
        });
        if (!selectionResponse.ok) return null;
      }

      return modelName;
    })().finally(() => {
      synchronization = null;
    });

    return synchronization;
  }

  function scheduleUploadSynchronization() {
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => {
      synchronizeActiveModel({ broadcast: true }).catch(error => {
        console.warn('[machine] Could not refresh the uploaded model:', error);
      });
    }, 1000);
  }

  async function checkOverlayAssets() {
    if (!isOverlay) return;

    try {
      const response = await authenticatedFetch('/api/machine/status');
      if (!response.ok) return;
      const status = await response.json().catch(() => ({}));
      const fileCount = Number(status.fileCount || 0);

      if (lastOverlayFileCount === null) {
        lastOverlayFileCount = fileCount;
        return;
      }

      if (fileCount !== lastOverlayFileCount) {
        lastOverlayFileCount = fileCount;
        await synchronizeActiveModel({ broadcast: true });
      }
    } catch (error) {
      console.warn('[machine] Could not check for overlay asset changes:', error);
    }
  }

  window.fetch = async function machineModelFetch(input, init) {
    const path = requestPath(input);
    const method = requestMethod(input, init);
    const response = await authenticatedFetch(input, init);

    if (path === '/api/machine/assets' && response.ok && (method === 'PUT' || method === 'DELETE')) {
      scheduleUploadSynchronization();
      return response;
    }

    if (path !== '/api/assets' || method !== 'GET' || !response.ok) return response;

    const assetData = await readJson(response);
    if (!assetData || typeof assetData !== 'object' || Object.keys(assetData).length > 0) {
      return response;
    }

    // A newly registered machine begins at "Default". Folder uploads create a
    // named model, so the first overlay request can legitimately receive an
    // empty asset map. Resolve and select the first valid machine model, then
    // retry this request with that explicit model name.
    const modelName = await synchronizeActiveModel({ broadcast: true });
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

  // Resolve stale registrations even when files were copied into machine-data
  // manually instead of uploaded in the UI.
  const initialSync = async () => {
    try {
      await synchronizeActiveModel({ broadcast: true });
      if (isOverlay) {
        await checkOverlayAssets();
        setInterval(checkOverlayAssets, 2000);
      }
    } catch (error) {
      console.warn('[machine] Could not synchronize the active model:', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialSync, { once: true });
  } else {
    initialSync();
  }
})();
