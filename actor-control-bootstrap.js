'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONTROL_PATH = path.join(APP_DIR, 'public', 'index.html');
const MARKER = 'data-as-adventurer-actor-control';
const LAN_CONTROL_BOOTSTRAP = [
  '<script src="/machine-client.js" data-as-adventurer-lan-bootstrap></script>',
  '<script src="/machine-media-url-compat.js"></script>',
  '<script src="/machine-control-emote-sync.js"></script>',
  `<script src="/actor-control-panel.js" ${MARKER}></script>`
].join('\n');

function injectControlBootstrap(html) {
  if (html.includes(MARKER)) return html;
  if (html.includes('</head>')) return html.replace('</head>', `${LAN_CONTROL_BOOTSTRAP}\n</head>`);
  return `${LAN_CONTROL_BOOTSTRAP}\n${html}`;
}

if (!express.__asActorControlFactoryPatched) {
  const currentExpressFactory = express;

  function actorControlExpressFactory(...args) {
    const app = currentExpressFactory(...args);

    const serveControlPage = (req, res, next) => {
      fs.readFile(CONTROL_PATH, 'utf8', (error, html) => {
        if (error) return next();
        res.type('html');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'HEAD') return res.end();
        return res.send(injectControlBootstrap(html));
      });
    };

    app.get('/', serveControlPage);
    app.get('/index.html', serveControlPage);
    return app;
  }

  Object.assign(actorControlExpressFactory, currentExpressFactory);
  actorControlExpressFactory.application = currentExpressFactory.application;
  actorControlExpressFactory.request = currentExpressFactory.request;
  actorControlExpressFactory.response = currentExpressFactory.response;
  actorControlExpressFactory.__asActorControlFactoryPatched = true;
  require.cache[require.resolve('express')].exports = actorControlExpressFactory;
}
