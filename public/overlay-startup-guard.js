(() => {
  'use strict';

  if (window.__AS_OVERLAY_STARTUP_GUARD__) return;
  window.__AS_OVERLAY_STARTUP_GUARD__ = true;

  const WARNING_ID = 'as-overlay-startup-warning';
  const MAX_WAIT_MS = 10000;
  const POLL_MS = 200;
  const startedAt = Date.now();

  function showWarning(message) {
    if (document.getElementById(WARNING_ID)) return;
    const warning = document.createElement('div');
    warning.id = WARNING_ID;
    warning.style.cssText = 'position:fixed;left:12px;top:12px;z-index:999999;padding:10px 14px;border-radius:8px;background:rgba(20,25,45,.94);color:#f4c15d;font:14px sans-serif;max-width:500px;white-space:normal;';
    warning.textContent = message;
    document.body.appendChild(warning);
  }

  function renderableLayers() {
    return [...document.querySelectorAll('.asset-layer')]
      .filter(layer => layer.id !== 'layer-emote');
  }

  function ensureInitialLayerVisible() {
    const layers = renderableLayers();
    if (!layers.length) return false;
    if (layers.some(layer => layer.classList.contains('active'))) return true;

    const neutral = document.getElementById('layer-neutral_idle');
    const target = neutral?.firstElementChild
      ? neutral
      : layers.find(layer => layer.firstElementChild);
    if (!target) return false;

    target.classList.add('active');
    const video = target.querySelector('video');
    if (video) video.play().catch(() => {});
    console.log(`[overlay] Startup guard activated ${target.id}.`);
    return true;
  }

  function checkStartup() {
    if (ensureInitialLayerVisible()) return;
    if (Date.now() - startedAt < MAX_WAIT_MS) {
      setTimeout(checkStartup, POLL_MS);
      return;
    }

    const actorOverlay = location.pathname.endsWith('/actor-overlay.html');
    showWarning(actorOverlay
      ? 'This actor overlay did not receive any renderable assets. Check the actor token, selected model, and model files.'
      : 'This overlay did not receive any renderable assets. Check the machine token, selected model, and model files.');
    console.warn('[overlay] No renderable assets were loaded within the startup timeout.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkStartup, { once: true });
  } else {
    checkStartup();
  }
})();
