// Webcam preview visibility control.
// Hides only the local preview; it never stops or replaces camera tracks.
(() => {
  'use strict';

  const startButton = document.getElementById('btn-start-webcam');
  const stopButton = document.getElementById('btn-stop-webcam');
  const webcamContainer = document.getElementById('webcam-container');
  const webcamVideo = document.getElementById('webcam-video');

  if (!startButton || !stopButton || !webcamContainer || !webcamVideo) return;

  let previewVisible = true;

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.id = 'btn-toggle-webcam-preview';
  toggleButton.className = 'btn btn-secondary';
  toggleButton.style.display = 'none';
  toggleButton.setAttribute('aria-controls', 'webcam-container');
  stopButton.insertAdjacentElement('afterend', toggleButton);

  function hasLiveVideoTrack() {
    const stream = webcamVideo.srcObject;
    return Boolean(
      stream &&
      typeof stream.getVideoTracks === 'function' &&
      stream.getVideoTracks().some(track => track && track.readyState === 'live')
    );
  }

  function renderPreviewState() {
    const webcamActive = hasLiveVideoTrack();

    // control.js uses inline display styles, so this controller must use the
    // same mechanism. The HTML hidden property can be overridden by an
    // existing inline display:block in some embedded Chromium/OBS versions.
    toggleButton.style.display = webcamActive ? '' : 'none';
    webcamContainer.style.display = webcamActive && previewVisible ? 'block' : 'none';
    toggleButton.textContent = previewVisible ? 'Hide Preview' : 'Show Preview';
    toggleButton.title = previewVisible
      ? 'Hide the local camera preview while keeping face tracking active'
      : 'Show the local camera preview';
    toggleButton.setAttribute('aria-pressed', String(!previewVisible));
  }

  toggleButton.addEventListener('click', () => {
    previewVisible = !previewVisible;
    renderPreviewState();
  });

  webcamVideo.addEventListener('playing', () => {
    const stream = webcamVideo.srcObject;
    if (stream && typeof stream.getVideoTracks === 'function') {
      stream.getVideoTracks().forEach(track => {
        if (track && typeof track.addEventListener === 'function') {
          track.addEventListener('ended', renderPreviewState, { once: true });
        }
      });
    }
    renderPreviewState();
  });

  stopButton.addEventListener('click', () => {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(renderPreviewState);
    } else {
      Promise.resolve().then(renderPreviewState);
    }
  });

  renderPreviewState();
})();
