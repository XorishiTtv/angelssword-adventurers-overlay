// AS Adventurer — SFX output-device router
(() => {
  'use strict';

  const NativeAudio = window.Audio;
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  const nativeMediaPlay = HTMLMediaElement.prototype.play;
  const routedMedia = new Set();
  const routedContexts = new Set();
  let outputDeviceId = '';
  let configSocket = null;

  async function applyMediaSink(element) {
    if (typeof element.setSinkId !== 'function') return;
    try {
      await element.setSinkId(outputDeviceId || '');
    } catch (error) {
      console.warn('[audio-output] Could not route media output:', error.message);
    }
  }

  async function applyContextSink(record) {
    if (record.mode === 'native' && typeof record.context.setSinkId === 'function') {
      try {
        await record.context.setSinkId(outputDeviceId || '');
      } catch (error) {
        console.warn('[audio-output] Could not route Web Audio output:', error.message);
      }
      return;
    }

    if (record.mediaElement) {
      await applyMediaSink(record.mediaElement);
      nativeMediaPlay.call(record.mediaElement).catch(() => {});
    }
  }

  function setOutputDevice(deviceId) {
    outputDeviceId = typeof deviceId === 'string' ? deviceId : '';
    routedMedia.forEach(element => applyMediaSink(element));
    routedContexts.forEach(record => applyContextSink(record));
    console.log(`[audio-output] Routed to ${outputDeviceId || 'system default'}`);
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
        context.close = async () => {
          routedContexts.delete(record);
          return originalClose();
        };
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

      const proxy = new Proxy(context, {
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

      return proxy;
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
          setOutputDevice(message.audioOutputDeviceId);
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
