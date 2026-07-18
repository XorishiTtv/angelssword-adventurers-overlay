// AS Adventurer — control panel bootstrap
(() => {
  'use strict';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  loadScript('speaking-source-capture.js')
    .then(() => loadScript('control-core.js'))
    .then(() => loadScript('audio-devices-control.js'))
    .catch(error => console.error('[audio-devices] Bootstrap failed:', error));
})();
