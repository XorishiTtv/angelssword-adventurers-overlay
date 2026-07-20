'use strict';

const express = require('express');

const MARKER = 'data-as-adventurer-actor-control';
const SCRIPT = `<script src="/actor-control-panel.js" ${MARKER}></script>`;

if (!express.response.__asActorControlPatched) {
  const nativeSend = express.response.send;

  express.response.send = function actorControlHtmlSend(body) {
    if (
      typeof body === 'string' &&
      !body.includes(MARKER) &&
      body.includes('</head>') &&
      (this.req?.method === 'GET' || this.req?.method === 'HEAD')
    ) {
      let pathname = '';
      try {
        pathname = new URL(this.req.url, 'http://localhost').pathname;
      } catch { /* ignore malformed request URL */ }

      if (pathname === '/' || pathname === '/index.html') {
        body = body.replace('</head>', `${SCRIPT}\n</head>`);
      }
    }

    return nativeSend.call(this, body);
  };

  express.response.__asActorControlPatched = true;
}
