// AS Adventurer — overlay bootstrap
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

  loadScript('audio-output-router.js')
    .then(() => loadScript('overlay-core.js'))
    .catch(error => console.error('[audio-output] Bootstrap failed:', error));
})();
