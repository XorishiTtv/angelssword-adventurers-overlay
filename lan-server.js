'use strict';

/**
 * Opt-in LAN launcher for AS Adventurer.
 *
 * The main server intentionally binds to 127.0.0.1. This launcher patches the
 * HTTP listen host to 0.0.0.0 and adapts same-origin WebSocket requests from a
 * LAN address so the existing localhost origin guard remains effective against
 * cross-site requests.
 */

const http = require('http');
const os = require('os');
const net = require('net');
const { WebSocketServer } = require('ws');

process.env.AS_ADVENTURER_LAN = '1';

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

let lanBannerPrinted = false;
function printLanBanner(server) {
  if (lanBannerPrinted) return;
  lanBannerPrinted = true;

  const address = server.address();
  const port = address && typeof address === 'object'
    ? address.port
    : (parseInt(process.env.PORT, 10) || 3000);
  const addresses = getLanAddresses();

  console.log('');
  console.log('  LAN MODE ENABLED');
  console.log('  Anyone on this trusted local network can control the overlay.');
  console.log('');

  if (addresses.length === 0) {
    console.log(`  Open this computer's LAN IP on port ${port} from the other computer.`);
  } else {
    for (const ip of addresses) {
      console.log(`  Control Panel:  http://${ip}:${port}`);
      console.log(`  OBS Overlay:    http://${ip}:${port}/overlay.html`);
      console.log('');
    }
  }

  console.log('  If another computer cannot connect, allow the app through');
  console.log('  Windows Firewall for Private networks. Press Ctrl+C to stop.');
  console.log('');
}

// server.js calls server.listen(port, '127.0.0.1', callback). Replace only that
// loopback host, leaving every other listen signature unchanged.
const originalListen = http.Server.prototype.listen;
http.Server.prototype.listen = function patchedListen(...args) {
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

// The existing server accepts browser WebSockets only from localhost. In LAN
// mode, permit a browser page served by this same private host and port, then
// normalize its Origin to localhost for the existing guard. Cross-origin and
// public-host requests are not rewritten and continue to be rejected.
const originalWsOn = WebSocketServer.prototype.on;
WebSocketServer.prototype.on = function patchedWebSocketOn(event, listener) {
  if (event !== 'connection') return originalWsOn.call(this, event, listener);

  return originalWsOn.call(this, event, function lanConnection(socket, request) {
    const origin = request && request.headers && request.headers.origin;
    const requestHost = request && request.headers && request.headers.host;

    if (origin && requestHost) {
      try {
        const originUrl = new URL(origin);
        const requestUrl = new URL(`http://${requestHost}`);
        const sameHost = originUrl.host.toLowerCase() === requestUrl.host.toLowerCase();
        const trustedHost = isPrivateLanHostname(originUrl.hostname);

        if (sameHost && trustedHost && (originUrl.protocol === 'http:' || originUrl.protocol === 'https:')) {
          const portSuffix = requestUrl.port ? `:${requestUrl.port}` : '';
          request.headers.origin = `http://localhost${portSuffix}`;
        }
      } catch {
        // Leave malformed origins untouched so server.js rejects them.
      }
    }

    return listener.call(this, socket, request);
  });
};

console.log('');
console.log('  Starting AS Adventurer in opt-in LAN mode...');
console.log('  Use only on a trusted home/private network.');

require('./server.js');
