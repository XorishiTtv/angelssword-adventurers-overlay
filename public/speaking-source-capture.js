// AS Adventurer — speaking detection capture source adapter
(() => {
  'use strict';

  const STORAGE_KEY = 'as-adventurer-settings';
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) return;

  const nativeGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  const nativeGetDisplayMedia = typeof mediaDevices.getDisplayMedia === 'function'
    ? mediaDevices.getDisplayMedia.bind(mediaDevices)
    : null;

  function loadSourceMode() {
    try {
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      return settings.speakingDetectionSource === 'output' ? 'output' : 'input';
    } catch {
      return 'input';
    }
  }

  function isSpeakingDetectionRequest(constraints) {
    const audio = constraints?.audio;
    return constraints?.video === false
      && audio
      && typeof audio === 'object'
      && audio.noiseSuppression === false
      && audio.echoCancellation === true
      && audio.autoGainControl === false;
  }

  function announce(type, detail = {}) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(`as-speaking-source-${type}`, { detail }));
    }, 0);
  }

  async function captureSharedOutput() {
    if (!nativeGetDisplayMedia) {
      throw new DOMException(
        'Output audio capture is not supported by this browser. Use microphone input instead.',
        'NotSupportedError'
      );
    }

    const displayStream = await nativeGetDisplayMedia({
      video: true,
      audio: {
        suppressLocalAudioPlayback: false
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude'
    });

    const audioTracks = displayStream.getAudioTracks();
    const videoTracks = displayStream.getVideoTracks();

    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach(track => track.stop());
      throw new DOMException(
        'The shared source did not include audio. Choose a tab/screen with audio and enable “Share audio”.',
        'NotFoundError'
      );
    }

    // getDisplayMedia requires a video track. Keep it alive (but disabled) because
    // some browser builds end the entire capture session when the video track stops.
    videoTracks.forEach(track => { track.enabled = false; });

    const primaryTrack = audioTracks[0];
    const sourceLabel = primaryTrack.label || 'Shared system/tab audio';

    primaryTrack.addEventListener('ended', () => {
      announce('ended', { source: 'output', label: sourceLabel });
    }, { once: true });

    announce('started', { source: 'output', label: sourceLabel });
    return displayStream;
  }

  mediaDevices.getUserMedia = function routedGetUserMedia(constraints) {
    if (isSpeakingDetectionRequest(constraints) && loadSourceMode() === 'output') {
      return captureSharedOutput();
    }
    return nativeGetUserMedia(constraints);
  };

  window.ASAdventurerSpeakingCapture = {
    supportsOutputCapture: Boolean(nativeGetDisplayMedia),
    getSourceMode: loadSourceMode
  };
})();
