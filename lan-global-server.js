'use strict';

// Load the shared global-model layer immediately after machine mode has patched
// Express, but before server.js creates its app and WebSocket server.
const machineMode = require('./machine-mode');
const { installGlobalModelMode } = require('./global-model-mode');
const nativeInstallMachineMode = machineMode.installMachineMode;

machineMode.installMachineMode = function installMachineAndGlobalModes(options) {
  const result = nativeInstallMachineMode(options);
  installGlobalModelMode({ appDir: options.appDir });
  return result;
};

require('./lan-server');
