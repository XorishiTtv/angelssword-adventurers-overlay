'use strict';

/**
 * Opt-in secure LAN launcher for AS Adventurer.
 *
 * The standard server remains localhost-only. This launcher:
 *   - binds the existing server to 0.0.0.0;
 *   - serves it over HTTPS when a LAN certificate is available;
 *   - requires a registered machine token for LAN APIs and WebSockets;
 *   - isolates each machine's models, emotes, uploads, and overlay messages.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { installMachineMode } = require('./machine-mode');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CERT_DIR = path.join(APP_DIR, 'lan-cert');
const DEFAULT_PFX_PATH = path.join(CERT_DIR, 'ASAdventurer-LAN-Server.pfx');
const DEFAULT_PASSWORD_PATH = path.join(CERT_DIR, 'ASAdventurer-LAN-Server.password.txt');
const SETUP_SCRIPT_PATH = path.join(APP_DIR, 'setup-lan-certificate.ps1');
const MACHINE_REGISTRY_PATH = path.resolve(APP_DIR, 'machine-data', 'registry.json');

// Windows does not consistently allow renameSync() to replace an existing
// destination. machine-mode writes the registry through a temporary file, so
// remove only that known destination immediately before its atomic rename.
const nativeRenameSync = fs.renameSync;
fs.renameSync = function windowsCompatibleRegistryRename(source, destination) {
  if (path.resolve(destination) === MACHINE_REGISTRY_PATH) {
    fs.rmSync(destination, { force: true });
  }
  return nativeRenameSync(source, destination);
};

process.env.AS_ADVENTURER_LAN = '1';
process.env.AS_ADVENTURER_MACHINE_AUTH = '1';

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function isPrivateLanHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
  if (!host.includes('.') && net.isIP(host) === 0) return true;

  if (net.isIP(host) === 4) {
    const parts = host.split('.').map(Number);
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 169 && parts[1] === 254)
      || parts[0] === 127;
  }

  if (net.isIP(host) === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  }

  return false;
}

function getLanAddresses() {
  const addresses = new Set();
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const info of interfaces || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.add(info.address);
    }
  }
  return [...addresses];
}

function runWindowsCertificateSetup() {
  if (process.platform !== 'win32' || !fs.existsSync(SETUP_SCRIPT_PATH)) return;
  if (fs.existsSync(DEFAULT_PFX_PATH) && fs.existsSync(DEFAULT_PASSWORD_PATH)) return;

  console.log('');
  console.log('  Creating the trusted HTTPS certificate for LAN camera/microphone access...');
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', SETUP_SCRIPT_PATH,
    '-OutputDir', CERT_DIR
  ], { stdio: 'inherit', windowsHide: false });
}

function loadTlsOptions() {
  runWindowsCertificateSetup();

  const pfxPath = process.env.AS_ADVENTURER_HTTPS_PFX || DEFAULT_PFX_PATH;
  const passwordPath = process.env.AS_ADVENTURER_HTTPS_PASSWORD_FILE || DEFAULT_PASSWORD_PATH;
  const passphrase = process.env.AS_ADVENTURER_HTTPS_PASSPHRASE
    || (fs.existsSync(passwordPath) ? fs.readFileSync(passwordPath, 'utf8').trim() : '');

  if (!fs.existsSync(pfxPath)) return null;

  try {
    return {
      pfx: fs.readFileSync(pfxPath),
      passphrase
    };
  } catch (error) {
    console.error(`  Could not load LAN HTTPS certificate: ${error.message}`);
    return null;
  }
}

const tlsOptions = loadTlsOptions();
const lanProtocol = tlsOptions ? 'https' : 'http';
const LAN_BROWSER_BOOTSTRAP = [
  '<script src="/machine-client.js" data-as-adventurer-lan-bootstrap></script>',
  '<script src="/machine-media-url-compat.js"></script>',
  '<script src="/machine-control-emote-sync.js"></script>'
].join('\n');

function injectLanBootstrap(html) {
  if (html.includes('data-as-adventurer-lan-bootstrap')) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${LAN_BROWSER_BOOTSTRAP}\n</head>`);
  return `${LAN_BROWSER_BOOTSTRAP}\n${html}`;
}

// Intercept only the two HTML entry points in LAN mode. All other static files
// continue through the original Express middleware.
const originalExpressStatic = express.static;
express.static = function patchedExpressStatic(root, options) {
  const staticMiddleware = originalExpressStatic(root, options);

  return function secureLanStatic(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      let pathname = '/';
      try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { /* use / */ }

      const fileName = pathname === '/' || pathname === '/index.html'
        ? 'index.html'
        : (pathname === '/overlay.html' ? 'overlay.html' : null);

      if (fileName) {
        fs.readFile(path.join(root, fileName), 'utf8', (error, html) => {
          if (error) return staticMiddleware(req, res, next);
          res.type('html');
          if (req.method === 'HEAD') return res.end();
          return res.send(injectLanBootstrap(html));
        });
        return;
      }
    }

    return staticMiddleware(req, res, next);
  };
};

// Replace the Express factory used by server.js so machine routes are installed
// before the original public static middleware and API routes.
const machineMode = installMachineMode({
  expressModule: express,
  WebSocketServer,
  appDir: APP_DIR
});

let lanBannerPrinted = false;
function printLanBanner(server) {
  if (lanBannerPrinted) return;
  lanBannerPrinted = true;

  const address = server.address();
  const port = address && typeof address === 'object'
    ? address.port
    : (parseInt(process.env.PORT, 10) || 3000);
  const addresses = getLanAddresses();
  const hostName = os.hostname();

  console.log('');
  console.log(`  SECURE LAN MODE ${tlsOptions ? 'ENABLED' : 'STARTED WITHOUT HTTPS'}`);
  console.log('  Each LAN computer must register a machine token.');
  console.log(`  Registered machines: ${machineMode.getMachineCount()}`);
  console.log('');

  if (tlsOptions) {
    console.log(`  Preferred address: ${lanProtocol}://${hostName}:${port}`);
    console.log(`  OBS Overlay:      ${lanProtocol}://${hostName}:${port}/overlay.html`);
    console.log('');
  }

  if (addresses.length === 0) {
    console.log(`  Open this computer's LAN address on port ${port} from the other computer.`);
  } else {
    for (const ip of addresses) {
      console.log(`  Control Panel:  ${lanProtocol}://${ip}:${port}`);
      console.log(`  OBS Overlay:    ${lanProtocol}://${ip}:${port}/overlay.html`);
      console.log('');
    }
  }

  if (tlsOptions) {
    console.log('  On each new computer, install the LAN certificate first, then open');
    console.log('  the Control Panel and create that computer\'s machine registration.');
  } else {
    console.log('  WARNING: camera and microphone are unavailable over plain HTTP.');
    console.log('  On Windows, run start-lan.bat so the HTTPS certificate is generated.');
  }
  console.log('  Machine assets and tokens are stored under machine-data/.');
  console.log('  Allow the app through Windows Firewall for Private networks only.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
}

function patchListen(server) {
  const originalListen = server.listen;
  server.listen = function patchedListen(...args) {
    if (typeof args[0] === 'object' && args[0] !== null) {
      if (isLoopbackHost(args[0].host)) args[0] = { ...args[0], host: '0.0.0.0' };
    } else if (isLoopbackHost(args[1])) {
      args[1] = '0.0.0.0';
    }

    const callbackIndex = args.findIndex(arg => typeof arg === 'function');
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex];
      args[callbackIndex] = (...callbackArgs) => {
        callback.apply(this, callbackArgs);
        printLanBanner(this);
      };
    } else {
      this.once('listening', () => printLanBanner(this));
    }

    return originalListen.apply(this, args);
  };
  return server;
}

// server.js creates its server through http.createServer(). In secure LAN mode,
// transparently return an HTTPS server instead and bind it to all interfaces.
const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(...args) {
  const server = tlsOptions
    ? https.createServer(tlsOptions, ...args)
    : originalCreateServer.apply(http, args);
  return patchListen(server);
};

// Permit only authenticated, same-origin browser WebSockets from a private LAN
// host. The existing localhost-only guard in server.js still performs the final
// origin check after the origin is normalized.
const originalWsOn = WebSocketServer.prototype.on;
WebSocketServer.prototype.on = function patchedWebSocketOn(event, listener) {
  if (event !== 'connection') return originalWsOn.call(this, event, listener);

  return originalWsOn.call(this, event, function lanConnection(socket, request) {
    const machine = machineMode.authenticateWebSocket(request);
    if (!machine) {
      socket.close(1008, 'machine token required');
      return;
    }
    machineMode.attachSocket(socket, machine);

    const origin = request && request.headers && request.headers.origin;
    const requestHost = request && request.headers && request.headers.host;

    if (origin && requestHost) {
      try {
        const originUrl = new URL(origin);
        const sameHost = originUrl.host.toLowerCase() === requestHost.toLowerCase();
        const trustedHost = isPrivateLanHostname(originUrl.hostname);

        if (sameHost && trustedHost && (originUrl.protocol === 'http:' || originUrl.protocol === 'https:')) {
          const port = requestHost.match(/:(\d+)$/)?.[1];
          request.headers.origin = `http://localhost${port ? `:${port}` : ''}`;
        }
      } catch {
        socket.close(1008, 'origin not allowed');
        return;
      }
    }

    return listener.call(this, socket, request);
  });
};

console.log('');
console.log('  Starting AS Adventurer in secure, machine-scoped LAN mode...');
console.log('  Use only on a trusted home/private network.');

require('./server.js');
