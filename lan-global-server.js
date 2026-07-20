'use strict';

// Load shared global models and AI actor support immediately after machine mode
// patches Express, but before server.js creates its app and WebSocket server.
const machineMode = require('./machine-mode');
const { installGlobalModelMode } = require('./global-model-mode');
const { installActorMode } = require('./actor-mode');
const nativeInstallMachineMode = machineMode.installMachineMode;

machineMode.installMachineMode = function installMachineGlobalAndActorModes(options) {
  const result = nativeInstallMachineMode(options);
  installGlobalModelMode({ appDir: options.appDir });
  const actorMode = installActorMode({ appDir: options.appDir });

  return {
    ...result,
    authenticateWebSocket(request) {
      return result.authenticateWebSocket(request) || actorMode.authenticateWebSocket(request);
    },
    attachSocket(socket, context) {
      if (context?.kind === 'actor') return actorMode.attachSocket(socket, context);
      return result.attachSocket(socket, context);
    },
    getActorCount: actorMode.getActorCount
  };
};

require('./lan-server');
