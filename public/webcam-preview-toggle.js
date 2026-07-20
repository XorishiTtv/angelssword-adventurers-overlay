// Webcam preview visibility control.
// Hides only the local preview while leaving the camera stream and MediaPipe tracking active.
(() => {
  'use strict';

  const STORAGE_KEY = 'as-adventurer-webcam-preview-visible';
  const startButton = document.getElementById('btn-start-webcam');
  const stopButton = document.getElementById('btn-stop-webcam');
  const webcamContainer = document.getElementById('webcam-container');
  const webcamVideo = document.getElementById('webcam-video');

  if (!startButton || !stopButton || !webcamContainer || !webcamVideo) return;

  let previewVisible = localStorage.getItem(STORAGE_KEY) !== 'false';

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.id = 'btn-toggle-webcam-preview';
  toggleButton.className = 'btn btn-secondary';
  toggleButton.style.display = 'none';
  stopButton.insertAdjacentElement('afterend', toggleButton);

  function isWebcamActive() {
    const stream = webcamVideo.srcObject;
    if (!stream || typeof stream.getVideoTracks !== 'function') return false;
    return stream.getVideoTracks().some(track => track.readyState === 'live');
  }

  function updatePreviewUi() {
    const active = isWebcamActive();

    toggleButton.style.display = active ? '' : 'none';
    toggleButton.textContent = previewVisible ? 'Hide Preview' : 'Show Preview';
    toggleButton.title = previewVisible
      ? 'Hide the local camera preview while keeping face tracking active'
      : 'Show the local camera preview';
    toggleButton.setAttribute('aria-pressed', String(!previewVisible));

    webcamContainer.style.display = active && previewVisible ? 'block' : 'none';
  }

  toggleButton.addEventListener('click', () => {
    previewVisible = !previewVisible;
    localStorage.setItem(STORAGE_KEY, String(previewVisible));
    updatePreviewUi();
  });

  webcamVideo.addEventListener('playing', () => requestAnimationFrame(updatePreviewUi));
  webcamVideo.addEventListener('emptied', updatePreviewUi);

  // The existing webcam controller changes these buttons when starting/stopping.
  // Observe those changes so a saved hidden state is reapplied after startup.
  const observer = new MutationObserver(() => requestAnimationFrame(updatePreviewUi));
  observer.observe(startButton, { attributes: true, attributeFilter: ['style', 'disabled'] });
  observer.observe(stopButton, { attributes: true, attributeFilter: ['style'] });

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  updatePreviewUi();
})();
