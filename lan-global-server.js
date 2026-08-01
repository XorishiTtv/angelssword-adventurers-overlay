'use strict';

// Load shared global models and AI actor support immediately after machine mode
// patches Express, but before server.js creates its app and WebSocket server.
const machineMode = require('./machine-mode');
const { installGlobalModelMode } = require('./global-model-mode');
const { installActorMode } = require('./actor-mode');
const { installActorCapabilitiesMode } = require('./actor-capabilities-mode');
const nativeInstallMachineMode = machineMode.installMachineMode;

machineMode.installMachineMode = function installMachineGlobalAndActorModes(options) {
  const result = nativeInstallMachineMode(options);
  installGlobalModelMode({ appDir: options.appDir });
  const actorMode = installActorMode({ appDir: options.appDir });
  installActorCapabilitiesMode({ appDir: options.appDir });

  return {
    ...result,
    authenticateWebSocket(request) {
      return result.authenticateWebSocket(request) || actorMode.authenticateWebSocket(request);
    },
    attachSocket(socket, context) {
      if (context?.kind === 'actor') {
        actorMode.attachSocket(socket, context);

        // A reconnect can occur after the actor changed models or after the
        // overlay first loaded while the LAN server was unavailable. Replay the
        // persisted model directly to this socket before actor-mode sends its
        // expression/speaking bootstrap, so the client can rebuild its layers.
        const bootstrap = setTimeout(() => {
          if (socket.readyState === 1 && typeof socket._asNativeSend === 'function') {
            socket._asNativeSend(JSON.stringify({
              type: 'model_change',
              model: context.actor.activeModel,
              actorId: context.actor.id,
              reason: 'socket_bootstrap'
            }));
          }
        }, 5);
        bootstrap.unref?.();
        return;
      }
      return result.attachSocket(socket, context);
    },
    getActorCount: actorMode.getActorCount
  };
};

require('./actor-control-bootstrap');
require('./lan-server');
