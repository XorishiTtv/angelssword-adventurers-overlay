// AS Adventurer — SFX output-device router
(() => {
  'use strict';

  const NativeAudio = window.Audio;
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  const nativeMediaPlay = HTMLMediaElement.prototype.play;
  const routedMedia = new Set();
  const routedContexts = new Set();
  let outputDeviceId = '';
  let outputDeviceLabel = '';
  let matchedLocalDeviceId = null;
  let configSocket = null;

  async function findLocalOutputByLabel() {
    if (!outputDeviceLabel || !navigator.mediaDevices?.enumerateDevices) return '';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(device =>
        device.kind === 'audiooutput' && device.label === outputDeviceLabel
      );
      return match?.deviceId || '';
    } catch {
      return '';
    }
  }

  async function sinkCandidates() {
    if (!outputDeviceId && !outputDeviceLabel) return [''];

    const candidates = [];
    if (matchedLocalDeviceId !== null) candidates.push(matchedLocalDeviceId);
    if (outputDeviceId) candidates.push(outputDeviceId);

    const localMatch = await findLocalOutputByLabel();
    if (localMatch) candidates.push(localMatch);
    candidates.push('');
    return [...new Set(candidates)];
  }

  async function setSink(target, methodName) {
    if (typeof target?.[methodName] !== 'function') return;

    let lastError = null;
    for (const candidate of await sinkCandidates()) {
      try {
        await target[methodName](candidate);
        matchedLocalDeviceId = candidate;
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      console.warn('[audio-output] Could not route audio output:', lastError.message);
    }
  }

  async function applyMediaSink(element) {
    await setSink(element, 'setSinkId');
  }

  async function applyContextSink(record) {
    if (record.mode === 'native') {
      await setSink(record.context, 'setSinkId');
      return;
    }

    if (record.mediaElement) {
      await applyMediaSink(record.mediaElement);
      const playResult = nativeMediaPlay.call(record.mediaElement);
      if (playResult?.catch) playResult.catch(() => {});
    }
  }

  function setOutputDevice(deviceId, deviceLabel) {
    outputDeviceId = typeof deviceId === 'string' ? deviceId : '';
    outputDeviceLabel = typeof deviceLabel === 'string' ? deviceLabel : '';
    matchedLocalDeviceId = null;
    routedMedia.forEach(element => applyMediaSink(element));
    routedContexts.forEach(record => applyContextSink(record));
    console.log(`[audio-output] Requested ${outputDeviceLabel || outputDeviceId || 'system default'}`);
  }

  if (typeof NativeAudio === 'function') {
    function RoutedAudio(src) {
      const element = new NativeAudio(src);
      const originalPlay = element.play.bind(element);
      routedMedia.add(element);

      element.play = async function routedPlay() {
        await applyMediaSink(element);
        return originalPlay();
      };

      const release = () => routedMedia.delete(element);
      element.addEventListener('ended', release, { once: true });
      element.addEventListener('error', release, { once: true });
      return element;
    }

    RoutedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(RoutedAudio, NativeAudio);
    window.Audio = RoutedAudio;
  }

  if (typeof NativeAudioContext === 'function') {
    function RoutedAudioContext(...args) {
      const context = new NativeAudioContext(...args);

      if (typeof context.setSinkId === 'function') {
        const record = { context, mode: 'native', mediaElement: null };
        routedContexts.add(record);
        applyContextSink(record);

        const originalClose = context.close.bind(context);
        try {
          Object.defineProperty(context, 'close', {
            configurable: true,
            value: async () => {
              routedContexts.delete(record);
              return originalClose();
            }
          });
        } catch {
          // The context will be removed when the page unloads.
        }
        return context;
      }

      if (typeof HTMLMediaElement.prototype.setSinkId !== 'function') {
        return context;
      }

      const streamDestination = context.createMediaStreamDestination();
      const mediaElement = new NativeAudio();
      mediaElement.autoplay = true;
      mediaElement.srcObject = streamDestination.stream;
      mediaElement.style.display = 'none';
      mediaElement.setAttribute('aria-hidden', 'true');
      document.body.appendChild(mediaElement);

      const record = {
        context,
        mode: 'media-stream',
        mediaElement,
        destination: streamDestination
      };
      routedContexts.add(record);
      applyContextSink(record);

      return new Proxy(context, {
        get(target, property) {
          if (property === 'destination') return streamDestination;
          if (property === 'close') {
            return async () => {
              routedContexts.delete(record);
              mediaElement.pause();
              mediaElement.srcObject = null;
              mediaElement.remove();
              return target.close();
            };
          }

          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }

    RoutedAudioContext.prototype = NativeAudioContext.prototype;
    Object.setPrototypeOf(RoutedAudioContext, NativeAudioContext);
    window.AudioContext = RoutedAudioContext;
    if (window.webkitAudioContext === NativeAudioContext) {
      window.webkitAudioContext = RoutedAudioContext;
    }
  }

  function connectConfigSocket() {
    configSocket = new WebSocket(`ws://${location.host}?type=overlay`);
    configSocket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'config'
          && Object.prototype.hasOwnProperty.call(message, 'audioOutputDeviceId')) {
          setOutputDevice(message.audioOutputDeviceId, message.audioOutputDeviceLabel);
        }
      } catch {
        // Ignore malformed messages.
      }
    });
    configSocket.addEventListener('close', () => setTimeout(connectConfigSocket, 3000));
    configSocket.addEventListener('error', () => configSocket.close());
  }

  connectConfigSocket();
})();
