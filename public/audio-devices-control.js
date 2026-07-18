// AS Adventurer — microphone input and SFX output controls
(() => {
  'use strict';

  const STORAGE_KEY = 'as-adventurer-settings';
  const micSelect = document.getElementById('mic-select');
  const startMicButton = document.getElementById('btn-start-mic');
  const stopMicButton = document.getElementById('btn-stop-mic');

  if (!micSelect || !navigator.mediaDevices?.enumerateDevices) return;

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(updates) {
    const settings = loadSettings();
    Object.assign(settings, updates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function removeSetting(key) {
    const settings = loadSettings();
    if (!Object.prototype.hasOwnProperty.call(settings, key)) return;
    delete settings[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  const card = micSelect.closest('.card');
  const cardBody = micSelect.closest('.card-body');
  const micRow = micSelect.closest('.input-row');
  const cardHeading = card?.querySelector('.card-header h2');
  const originalHelp = cardBody?.querySelector('.help-text');

  if (cardHeading) cardHeading.textContent = '🎧 Audio Devices';
  if (originalHelp) {
    originalHelp.textContent = 'Choose the microphone used for speaking detection and the playback device used for emote sound effects.';
  }

  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group';
  inputGroup.id = 'speaking-input-device-group';
  inputGroup.innerHTML = '<label for="mic-select">Speaking Detection Input</label>';

  if (micRow?.parentElement) {
    const parent = micRow.parentElement;
    parent.insertBefore(inputGroup, micRow);
    inputGroup.appendChild(micRow);
  } else {
    cardBody?.appendChild(inputGroup);
    inputGroup.appendChild(micSelect);
  }

  const outputGroup = document.createElement('div');
  outputGroup.className = 'input-group';
  outputGroup.id = 'audio-output-device-group';
  outputGroup.style.marginTop = '14px';
  outputGroup.innerHTML = `
    <label for="audio-output-select">SFX Playback Output</label>
    <div class="input-row">
      <select id="audio-output-select" class="mic-dropdown">
        <option value="">System default</option>
      </select>
      <button class="btn btn-secondary btn-small" id="btn-refresh-audio-devices" type="button">Refresh</button>
    </div>
    <div class="help-text" id="audio-output-device-status" style="margin-top:6px;"></div>
  `;
  inputGroup.insertAdjacentElement('afterend', outputGroup);

  const outputSelect = document.getElementById('audio-output-select');
  const refreshButton = document.getElementById('btn-refresh-audio-devices');
  const outputStatus = document.getElementById('audio-output-device-status');
  const supportsOutputSelection = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.prototype.setSinkId === 'function';

  let deviceSocket = null;
  let refreshPromise = null;
  let refreshTimer = null;
  let permissionRequested = false;

  function detectionIsActive() {
    return Boolean(stopMicButton && stopMicButton.style.display !== 'none');
  }

  function setOutputStatus(message, isError = false) {
    outputStatus.textContent = message;
    outputStatus.style.color = isError ? '#f87171' : '';
  }

  function sendOutputConfig() {
    if (!deviceSocket || deviceSocket.readyState !== WebSocket.OPEN) return;
    deviceSocket.send(JSON.stringify({
      type: 'config',
      audioOutputDeviceId: outputSelect.value || '',
      audioOutputDeviceLabel: outputSelect.value
        ? (outputSelect.options[outputSelect.selectedIndex]?.textContent || '')
        : ''
    }));
  }

  function connectDeviceSocket() {
    deviceSocket = new WebSocket(`ws://${location.host}?type=control`);
    deviceSocket.addEventListener('open', sendOutputConfig);
    deviceSocket.addEventListener('close', () => setTimeout(connectDeviceSocket, 3000));
    deviceSocket.addEventListener('error', () => deviceSocket.close());
  }

  function preferredDevice(devices, savedId) {
    return devices.find(device => device.deviceId === savedId)
      || devices.find(device => device.deviceId === 'default')
      || devices[0]
      || null;
  }

  function replaceMicOptions(inputs, preferredId) {
    const selected = preferredDevice(inputs, preferredId);
    micSelect.innerHTML = '';

    if (!inputs.length) {
      micSelect.innerHTML = '<option value="">No microphones found</option>';
      return '';
    }

    inputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;
      option.selected = device.deviceId === selected?.deviceId;
      micSelect.appendChild(option);
    });

    return selected?.deviceId || '';
  }

  function replaceOutputOptions(outputs, preferredId, preferredLabel) {
    outputSelect.innerHTML = '<option value="">System default</option>';

    outputs
      .filter(device => device.deviceId !== 'default')
      .forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Audio output ${index + 1}`;
        outputSelect.appendChild(option);
      });

    const selected = outputs.find(device => device.deviceId === preferredId)
      || outputs.find(device => preferredLabel && device.label === preferredLabel)
      || null;
    outputSelect.value = selected && selected.deviceId !== 'default' ? selected.deviceId : '';

    return {
      id: outputSelect.value,
      label: outputSelect.value
        ? (outputSelect.options[outputSelect.selectedIndex]?.textContent || selected?.label || '')
        : ''
    };
  }

  async function requestAudioPermission() {
    if (permissionRequested || !navigator.mediaDevices.getUserMedia) return;
    permissionRequested = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      permissionRequested = false;
      throw error;
    }
  }

  async function refreshDevices({ requestPermission = false } = {}) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      refreshButton.disabled = true;
      const settings = loadSettings();

      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        const labelsMissing = devices.some(device =>
          (device.kind === 'audioinput' || device.kind === 'audiooutput') && !device.label
        );

        if (requestPermission && labelsMissing) {
          await requestAudioPermission();
          devices = await navigator.mediaDevices.enumerateDevices();
        }

        const inputs = devices.filter(device => device.kind === 'audioinput');
        const outputs = devices.filter(device => device.kind === 'audiooutput');
        const micDeviceId = replaceMicOptions(inputs, micSelect.value || settings.micDeviceId || '');
        const outputSelection = replaceOutputOptions(
          outputs,
          settings.audioOutputDeviceId || '',
          settings.audioOutputDeviceLabel || ''
        );

        saveSettings({
          micDeviceId,
          audioOutputDeviceId: outputSelection.id,
          audioOutputDeviceLabel: outputSelection.label
        });
        sendOutputConfig();

        outputSelect.disabled = !supportsOutputSelection;
        if (!supportsOutputSelection) {
          setOutputStatus('SFX output selection is not supported by this browser/OBS build. SFX will use the default output.');
        } else if (!outputs.length) {
          setOutputStatus('No playback outputs are exposed. SFX will use the system default.');
        } else if (devices.some(device =>
          (device.kind === 'audioinput' || device.kind === 'audiooutput') && !device.label
        )) {
          setOutputStatus('Grant microphone access to show device names.');
        } else {
          setOutputStatus(`${inputs.length} input${inputs.length === 1 ? '' : 's'} · ${outputs.length} playback output${outputs.length === 1 ? '' : 's'} available`);
        }
      } catch (error) {
        console.warn('[audio-devices] Could not refresh devices:', error);
        setOutputStatus(`Could not load audio devices: ${error.message}`, true);
      } finally {
        refreshButton.disabled = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function restartActiveMicrophone() {
    if (!detectionIsActive() || !startMicButton || !stopMicButton) return;
    stopMicButton.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    startMicButton.click();
  }

  micSelect.addEventListener('change', async () => {
    saveSettings({ micDeviceId: micSelect.value });
    await restartActiveMicrophone();
  });

  outputSelect.addEventListener('change', () => {
    saveSettings({
      audioOutputDeviceId: outputSelect.value || '',
      audioOutputDeviceLabel: outputSelect.value
        ? (outputSelect.options[outputSelect.selectedIndex]?.textContent || '')
        : ''
    });
    sendOutputConfig();
  });

  refreshButton.addEventListener('click', () => refreshDevices({ requestPermission: true }));
  outputSelect.addEventListener('pointerdown', () => refreshDevices({ requestPermission: true }), { once: true });

  navigator.mediaDevices.addEventListener?.('devicechange', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDevices(), 250);
  });

  removeSetting('speakingDetectionSource');
  connectDeviceSocket();
  refreshDevices();
  setTimeout(() => refreshDevices(), 1000);
  setInterval(sendOutputConfig, 5000);
})();
