(() => {
  'use strict';

  if (window.__AS_ACTOR_CONTROL_PANEL__) return;
  window.__AS_ACTOR_CONTROL_PANEL__ = true;
  if (location.pathname.endsWith('/overlay.html') || location.pathname.endsWith('/actor-overlay.html')) return;

  const EXPRESSIONS = [
    { value: 'neutral', label: '😐 Neutral' },
    { value: 'happy', label: '😊 Happy' },
    { value: 'sad', label: '😢 Sad' },
    { value: 'surprised', label: '😮 Surprised' },
    { value: 'eyes_closed', label: '😑 Eyes Closed' }
  ];

  let card = null;
  let actorList = null;
  let actorSummary = null;
  let message = null;
  let createName = null;
  let createModel = null;
  let createDefault = null;
  let createButton = null;
  let secretPanel = null;
  let secretToken = null;
  let secretUrl = null;
  let models = [];
  let actors = [];
  let maxActors = 16;
  let pollTimer = null;
  let loading = false;
  const emoteCatalogs = new Map();

  function setMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text || '';
    message.style.color = isError ? '#f4c15d' : '';
  }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function jsonPost(path, body = {}) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async function copyText(value, button) {
    const text = String(value || '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    if (button) {
      const original = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => { button.textContent = original; }, 1300);
    }
  }

  function installStyles() {
    if (document.getElementById('as-actor-control-styles')) return;
    const style = document.createElement('style');
    style.id = 'as-actor-control-styles';
    style.textContent = `
      #ai-actors-card .actor-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #ai-actors-card .actor-summary{font-size:11px;opacity:.78}
      #ai-actors-card .actor-create{border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:12px;margin-bottom:12px;background:rgba(0,0,0,.12)}
      #ai-actors-card .actor-create-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:8px}
      #ai-actors-card .actor-create-grid .actor-create-default{grid-column:1 / -1}
      #ai-actors-card .actor-create-actions{display:flex;justify-content:flex-end;margin-top:9px}
      #ai-actors-card .actor-secret{border:1px solid rgba(224,184,77,.55);border-radius:10px;padding:12px;margin:12px 0;background:rgba(224,184,77,.08)}
      #ai-actors-card .actor-secret[hidden]{display:none}
      #ai-actors-card .actor-secret-warning{font-size:12px;line-height:1.45;margin-bottom:9px;color:#f4d57f}
      #ai-actors-card .actor-secret-row{display:flex;gap:7px;align-items:stretch;margin-top:7px}
      #ai-actors-card .actor-secret-row input,#ai-actors-card .actor-secret-row textarea{flex:1;min-width:0}
      #ai-actors-card .actor-secret-row textarea{resize:vertical;min-height:58px}
      #ai-actors-card .actor-list{display:flex;flex-direction:column;gap:10px}
      #ai-actors-card .actor-empty{padding:16px;border:1px dashed rgba(255,255,255,.14);border-radius:10px;text-align:center}
      #ai-actors-card .actor-item{border:1px solid rgba(255,255,255,.11);border-radius:11px;padding:11px;background:rgba(0,0,0,.13)}
      #ai-actors-card .actor-item-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      #ai-actors-card .actor-name{flex:1;min-width:140px;font-weight:600}
      #ai-actors-card .actor-badges{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}
      #ai-actors-card .actor-badge{font-size:11px;padding:3px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05)}
      #ai-actors-card .actor-badge.actor-speaking{border-color:rgba(92,221,154,.6);color:#86efb7}
      #ai-actors-card .actor-badge.actor-emote-active{border-color:rgba(224,184,77,.6);color:#f4d57f}
      #ai-actors-card .actor-model-row{display:flex;gap:7px;align-items:center}
      #ai-actors-card .actor-model-row select{flex:1;min-width:0}
      #ai-actors-card .actor-expression-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}
      #ai-actors-card .actor-expression-grid .btn{padding:7px 5px;font-size:11px}
      #ai-actors-card .actor-expression-grid .actor-expression-active{outline:1px solid #e0b84d;color:#f4d57f}
      #ai-actors-card .actor-emotes{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.09)}
      #ai-actors-card .actor-emote-title{font-size:12px;font-weight:700;margin-bottom:7px}
      #ai-actors-card .actor-emote-row{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}
      #ai-actors-card .actor-emote-row select{flex:1;min-width:145px}
      #ai-actors-card .actor-emote-help{font-size:11px;opacity:.72;margin-top:5px}
      #ai-actors-card .actor-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
      #ai-actors-card .actor-actions .btn,#ai-actors-card .actor-emote-row .btn{font-size:11px}
      #ai-actors-card .actor-danger{border-color:rgba(238,96,96,.45)!important;color:#ffb0b0!important}
      @media (max-width:700px){
        #ai-actors-card .actor-create-grid{grid-template-columns:1fr}
        #ai-actors-card .actor-create-grid .actor-create-default{grid-column:auto}
        #ai-actors-card .actor-expression-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }`;
    document.head.appendChild(style);
  }

  function modelLabel(model) {
    return `${model.displayName || model.name} (${model.assetCount ?? 0} assets)`;
  }

  function fillModelSelect(select, selected) {
    const active = selected || select.value;
    select.innerHTML = '';
    for (const groupInfo of [
      { scope: 'global', label: 'Global Models' },
      { scope: 'private', label: 'My Models' }
    ]) {
      const groupModels = models.filter(model => model.scope === groupInfo.scope);
      if (!groupModels.length) continue;
      const group = document.createElement('optgroup');
      group.label = groupInfo.label;
      for (const model of groupModels) {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = modelLabel(model);
        option.selected = model.name === active;
        group.appendChild(option);
      }
      select.appendChild(group);
    }
    if (!models.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No actor-compatible models found';
      select.appendChild(option);
    }
    if (active && [...select.options].some(option => option.value === active)) select.value = active;
  }

  function showSecret(result, label) {
    secretPanel.hidden = false;
    secretPanel.querySelector('.actor-secret-title').textContent = `${label} credentials`;
    secretToken.value = result.token || '';
    secretUrl.value = result.obsUrl || '';
    secretPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideSecret() {
    secretToken.value = '';
    secretUrl.value = '';
    secretPanel.hidden = true;
  }

  function actorIdsChanged(nextActors) {
    return actors.map(actor => actor.id).join('|') !== nextActors.map(actor => actor.id).join('|');
  }

  function currentActor(actorId) {
    return actors.find(actor => actor.id === actorId) || null;
  }

  function stateText(actor) {
    const expression = actor.state?.expression || actor.defaultExpression || 'neutral';
    return `${expression.replace('_', ' ')} · ${actor.state?.speaking ? 'speaking' : 'idle'}`;
  }

  function flattenSubs(subs, prefix = [], result = []) {
    for (const sub of subs || []) {
      const subPath = [...prefix, sub.name];
      result.push({ path: subPath.join('/'), label: subPath.join(' › ') });
      flattenSubs(sub.subs, subPath, result);
    }
    return result;
  }

  function updateSubSelect(row) {
    const emoteSelect = row.querySelector('.actor-emote-select');
    const subSelect = row.querySelector('.actor-sub-select');
    const catalog = emoteCatalogs.get(row.dataset.actorId);
    const emote = catalog?.emotes?.find(item => item.name === emoteSelect.value);
    const previous = subSelect.value;
    subSelect.innerHTML = '';

    const subs = flattenSubs(emote?.subs);
    if (!subs.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No sub-animations';
      subSelect.appendChild(option);
      subSelect.disabled = true;
      row.querySelector('.actor-trigger-sub').disabled = true;
      return;
    }

    for (const sub of subs) {
      const option = document.createElement('option');
      option.value = sub.path;
      option.textContent = sub.label;
      subSelect.appendChild(option);
    }
    if (subs.some(sub => sub.path === previous)) subSelect.value = previous;
    subSelect.disabled = false;
    row.querySelector('.actor-trigger-sub').disabled = false;
  }

  function renderEmoteCatalog(row, actor, data) {
    const emoteSelect = row.querySelector('.actor-emote-select');
    const previous = emoteSelect.value;
    const emotes = Array.isArray(data.emotes) ? data.emotes : [];
    emoteCatalogs.set(actor.id, { model: actor.activeModel, emotes });
    emoteSelect.innerHTML = '';

    if (!emotes.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No emotes in this model';
      emoteSelect.appendChild(option);
      emoteSelect.disabled = true;
      row.querySelector('.actor-trigger-emote').disabled = true;
      row.querySelector('.actor-release-emote').disabled = !actor.state?.activeEmote;
      updateSubSelect(row);
      row.querySelector('.actor-emote-help').textContent = 'Add model emotes under emotes/<name>/ using the existing Type 1 or Type 2 folder layout.';
      return;
    }

    for (const emote of emotes) {
      const option = document.createElement('option');
      option.value = emote.name;
      option.textContent = `${emote.name} · Type ${emote.emoteType || '?'}`;
      emoteSelect.appendChild(option);
    }
    const preferred = actor.state?.activeEmote || previous;
    if (preferred && emotes.some(emote => emote.name === preferred)) emoteSelect.value = preferred;
    emoteSelect.disabled = false;
    row.querySelector('.actor-trigger-emote').disabled = false;
    row.querySelector('.actor-release-emote').disabled = !actor.state?.activeEmote;
    row.querySelector('.actor-emote-help').textContent = actor.state?.activeEmote
      ? `Active emote: ${actor.state.activeEmote}`
      : `${emotes.length} emote${emotes.length === 1 ? '' : 's'} available`;
    updateSubSelect(row);
  }

  async function loadActorEmotes(actor, row, showErrors = false) {
    try {
      row.querySelector('.actor-emote-help').textContent = 'Loading emotes…';
      const data = await api(`/api/actors/${encodeURIComponent(actor.id)}/manage/emotes`);
      if (!row.isConnected) return;
      const latest = currentActor(actor.id) || actor;
      renderEmoteCatalog(row, latest, data);
    } catch (error) {
      if (showErrors) setMessage(error.message, true);
      if (row.isConnected) row.querySelector('.actor-emote-help').textContent = `Could not load emotes: ${error.message}`;
    }
  }

  function createActorRow(actor) {
    const row = document.createElement('div');
    row.className = 'actor-item';
    row.dataset.actorId = actor.id;
    row.innerHTML = `
      <div class="actor-item-head">
        <input class="actor-name" maxlength="60" aria-label="Actor name">
        <button class="btn btn-small btn-secondary actor-save-name">Save name</button>
        <button class="btn btn-small actor-copy-id">Copy ID</button>
        <button class="btn btn-small actor-delete actor-danger">Delete</button>
      </div>
      <div class="actor-badges">
        <span class="actor-badge actor-state-badge"></span>
        <span class="actor-badge actor-emote-badge"></span>
        <span class="actor-badge actor-model-badge"></span>
        <span class="actor-badge actor-id-badge"></span>
      </div>
      <div class="actor-model-row">
        <select class="model-select actor-model"></select>
        <button class="btn btn-small btn-secondary actor-save-model">Apply model</button>
      </div>
      <div class="actor-expression-grid"></div>
      <div class="actor-actions">
        <button class="btn btn-small btn-primary actor-speaking">🎤 Test speaking</button>
        <button class="btn btn-small btn-secondary actor-idle">Idle</button>
        <button class="btn btn-small btn-secondary actor-reset">Reset</button>
        <button class="btn btn-small btn-secondary actor-regenerate">Regenerate token + OBS URL</button>
      </div>
      <div class="actor-emotes">
        <div class="actor-emote-title">🎭 Actor emotes</div>
        <div class="actor-emote-row">
          <select class="model-select actor-emote-select"><option>Loading emotes…</option></select>
          <button class="btn btn-small btn-primary actor-trigger-emote">Trigger</button>
          <button class="btn btn-small btn-secondary actor-release-emote">Release</button>
        </div>
        <div class="actor-emote-row">
          <select class="model-select actor-sub-select"><option>No sub-animations</option></select>
          <button class="btn btn-small btn-secondary actor-trigger-sub">Trigger sub</button>
        </div>
        <div class="actor-emote-help help-text">Loading emotes…</div>
      </div>`;

    const expressionGrid = row.querySelector('.actor-expression-grid');
    for (const expression of EXPRESSIONS) {
      const button = document.createElement('button');
      button.className = 'btn btn-small btn-secondary actor-expression';
      button.dataset.expression = expression.value;
      button.textContent = expression.label;
      expressionGrid.appendChild(button);
    }

    row.querySelector('.actor-save-name').addEventListener('click', event => runButton(event.currentTarget, async () => {
      const name = row.querySelector('.actor-name').value.trim();
      if (!name) throw new Error('Actor name is required.');
      await api(`/api/actors/${encodeURIComponent(actor.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      setMessage(`Renamed actor to ${name}.`);
      await refreshActors(true);
    }));

    row.querySelector('.actor-copy-id').addEventListener('click', event => copyText(actor.id, event.currentTarget));

    row.querySelector('.actor-delete').addEventListener('click', async event => {
      const current = currentActor(actor.id) || actor;
      if (!confirm(`Delete AI actor "${current.name}"?\n\nIts OBS source will disconnect and its actor token will stop working. This cannot be undone.`)) return;
      await runButton(event.currentTarget, async () => {
        await api(`/api/actors/${encodeURIComponent(actor.id)}`, { method: 'DELETE' });
        emoteCatalogs.delete(actor.id);
        if (!secretPanel.hidden && secretPanel.dataset.actorId === actor.id) hideSecret();
        setMessage(`Deleted ${current.name}.`);
        await refreshActors(true);
      });
    });

    row.querySelector('.actor-save-model').addEventListener('click', event => runButton(event.currentTarget, async () => {
      const model = row.querySelector('.actor-model').value;
      if (!model) throw new Error('Choose a model first.');
      await api(`/api/actors/${encodeURIComponent(actor.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      emoteCatalogs.delete(actor.id);
      setMessage(`Updated ${(currentActor(actor.id) || actor).name}'s model.`);
      await refreshActors(true);
      const latest = currentActor(actor.id) || actor;
      await loadActorEmotes(latest, row, true);
    }));

    for (const button of row.querySelectorAll('.actor-expression')) {
      button.addEventListener('click', event => runButton(event.currentTarget, async () => {
        await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/state`, {
          expression: event.currentTarget.dataset.expression
        });
        await refreshActors(true);
      }));
    }

    row.querySelector('.actor-speaking').addEventListener('click', event => runButton(event.currentTarget, async () => {
      await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/state`, {
        speaking: true,
        expiresInMs: 45000
      });
      await refreshActors(true);
    }));

    row.querySelector('.actor-idle').addEventListener('click', event => runButton(event.currentTarget, async () => {
      await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/state`, { speaking: false });
      await refreshActors(true);
    }));

    row.querySelector('.actor-reset').addEventListener('click', event => runButton(event.currentTarget, async () => {
      await api(`/api/actors/${encodeURIComponent(actor.id)}/manage/reset`, { method: 'POST' });
      await refreshActors(true);
      await loadActorEmotes(currentActor(actor.id) || actor, row, false);
    }));

    row.querySelector('.actor-regenerate').addEventListener('click', async event => {
      const current = currentActor(actor.id) || actor;
      if (!confirm(`Regenerate the token for "${current.name}"?\n\nThe old OBS URL will disconnect and stop working.`)) return;
      await runButton(event.currentTarget, async () => {
        const result = await api(`/api/actors/${encodeURIComponent(actor.id)}/token/regenerate`, { method: 'POST' });
        secretPanel.dataset.actorId = actor.id;
        showSecret(result, current.name);
        setMessage(`Generated a new token and OBS URL for ${current.name}.`);
        await refreshActors(true);
      });
    });

    row.querySelector('.actor-emote-select').addEventListener('change', () => updateSubSelect(row));

    row.querySelector('.actor-trigger-emote').addEventListener('click', event => runButton(event.currentTarget, async () => {
      const name = row.querySelector('.actor-emote-select').value;
      if (!name) throw new Error('Choose an emote first.');
      await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/emote/trigger`, { name });
      setMessage(`Triggered ${name} for ${(currentActor(actor.id) || actor).name}.`);
      await refreshActors(true);
      await loadActorEmotes(currentActor(actor.id) || actor, row, false);
    }));

    row.querySelector('.actor-release-emote').addEventListener('click', event => runButton(event.currentTarget, async () => {
      await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/emote/release`);
      setMessage(`Released ${(currentActor(actor.id) || actor).name}'s active emote.`);
      await refreshActors(true);
      await loadActorEmotes(currentActor(actor.id) || actor, row, false);
    }));

    row.querySelector('.actor-trigger-sub').addEventListener('click', event => runButton(event.currentTarget, async () => {
      const name = row.querySelector('.actor-sub-select').value;
      if (!name) throw new Error('Choose a sub-animation first.');
      await jsonPost(`/api/actors/${encodeURIComponent(actor.id)}/manage/emote/sub`, { name });
      setMessage(`Triggered sub-animation ${name} for ${(currentActor(actor.id) || actor).name}.`);
    }));

    loadActorEmotes(actor, row, false);
    return row;
  }

  function updateActorRow(row, actor) {
    const nameInput = row.querySelector('.actor-name');
    if (document.activeElement !== nameInput) nameInput.value = actor.name;
    row.querySelector('.actor-state-badge').textContent = stateText(actor);
    row.querySelector('.actor-state-badge').classList.toggle('actor-speaking', Boolean(actor.state?.speaking));

    const emoteBadge = row.querySelector('.actor-emote-badge');
    emoteBadge.textContent = actor.state?.activeEmote ? `emote: ${actor.state.activeEmote}` : 'no active emote';
    emoteBadge.classList.toggle('actor-emote-active', Boolean(actor.state?.activeEmote));

    row.querySelector('.actor-model-badge').textContent = actor.activeModel;
    row.querySelector('.actor-id-badge').textContent = actor.id;

    const modelSelect = row.querySelector('.actor-model');
    if (document.activeElement !== modelSelect) fillModelSelect(modelSelect, actor.activeModel);

    for (const button of row.querySelectorAll('.actor-expression')) {
      button.classList.toggle('actor-expression-active', button.dataset.expression === actor.state?.expression);
    }

    row.querySelector('.actor-release-emote').disabled = !actor.state?.activeEmote;
    const cached = emoteCatalogs.get(actor.id);
    if (!cached || cached.model !== actor.activeModel) loadActorEmotes(actor, row, false);
    else {
      const help = row.querySelector('.actor-emote-help');
      help.textContent = actor.state?.activeEmote
        ? `Active emote: ${actor.state.activeEmote}`
        : `${cached.emotes.length} emote${cached.emotes.length === 1 ? '' : 's'} available`;
    }
  }

  function renderActors(nextActors) {
    const rebuild = actorIdsChanged(nextActors);
    actors = nextActors;

    if (rebuild) {
      actorList.innerHTML = '';
      const liveIds = new Set(actors.map(actor => actor.id));
      for (const id of emoteCatalogs.keys()) {
        if (!liveIds.has(id)) emoteCatalogs.delete(id);
      }
      if (!actors.length) {
        actorList.innerHTML = '<div class="help-text actor-empty">No AI actors yet. Create the first actor above.</div>';
      } else {
        for (const actor of actors) actorList.appendChild(createActorRow(actor));
      }
    }

    for (const actor of actors) {
      const row = actorList.querySelector(`[data-actor-id="${actor.id}"]`);
      if (row) updateActorRow(row, actor);
    }

    actorSummary.textContent = `${actors.length}/${maxActors} actors`;
    createButton.disabled = actors.length >= maxActors || models.length === 0;
    createButton.title = actors.length >= maxActors ? `Actor limit reached (${maxActors})` : '';
  }

  async function runButton(button, action) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Working…';
    try {
      setMessage('');
      await action();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function refreshActors(showErrors = false) {
    if (loading) return;
    loading = true;
    try {
      const data = await api('/api/actors');
      maxActors = Number(data.maxActors || 16);
      renderActors(Array.isArray(data.actors) ? data.actors : []);
    } catch (error) {
      if (showErrors) setMessage(error.message, true);
    } finally {
      loading = false;
    }
  }

  async function refreshAll(showErrors = true) {
    try {
      const [modelData, actorData] = await Promise.all([
        api('/api/actors/models'),
        api('/api/actors')
      ]);
      models = Array.isArray(modelData.models) ? modelData.models : [];
      maxActors = Number(actorData.maxActors || 16);
      fillModelSelect(createModel, createModel.value);
      renderActors(Array.isArray(actorData.actors) ? actorData.actors : []);
      if (!models.length) setMessage('No actor-compatible models were found.', true);
      else if (showErrors) setMessage('');
    } catch (error) {
      if (showErrors) setMessage(error.message, true);
    }
  }

  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.hidden) refreshActors(false);
    }, 2000);
  }

  function buildCard() {
    if (document.getElementById('ai-actors-card')) return true;
    const column = document.querySelector('.main-grid .column:last-child') || document.querySelector('.main-grid .column');
    if (!column) return false;

    installStyles();
    card = document.createElement('div');
    card.className = 'card card-highlight';
    card.id = 'ai-actors-card';
    card.innerHTML = `
      <div class="card-header actor-toolbar">
        <div>
          <h2>🤖 AI Actors</h2>
          <div class="help-text actor-summary">Loading actors…</div>
        </div>
        <button class="btn btn-small btn-secondary actor-refresh">Refresh</button>
      </div>
      <div class="card-body">
        <div class="actor-create">
          <div class="help-text" style="margin-bottom:8px">Create API-controlled actors with independent OBS sources, expressions, speaking state, and emotes.</div>
          <div class="actor-create-grid">
            <input class="actor-create-name" maxlength="60" placeholder="Actor name">
            <select class="model-select actor-create-model"></select>
            <select class="model-select actor-create-default">
              ${EXPRESSIONS.map(expression => `<option value="${expression.value}">${expression.label} default</option>`).join('')}
            </select>
          </div>
          <div class="actor-create-actions">
            <button class="btn btn-primary actor-create-button">Create actor</button>
          </div>
        </div>
        <div class="actor-secret" hidden>
          <div class="actor-toolbar">
            <strong class="actor-secret-title">New actor credentials</strong>
            <button class="btn btn-small actor-hide-secret">Hide</button>
          </div>
          <div class="actor-secret-warning">Save these now. The raw actor token and complete OBS URL are shown only when an actor is created or its token is regenerated.</div>
          <label>Actor token</label>
          <div class="actor-secret-row">
            <input class="actor-secret-token" type="password" readonly>
            <button class="btn btn-small btn-secondary actor-reveal-token">Show</button>
            <button class="btn btn-small actor-copy-token">Copy</button>
          </div>
          <label style="display:block;margin-top:8px">OBS Browser Source URL</label>
          <div class="actor-secret-row">
            <textarea class="actor-secret-url" readonly></textarea>
            <button class="btn btn-small actor-copy-url">Copy URL</button>
          </div>
        </div>
        <div class="actor-message help-text" style="min-height:18px;margin-bottom:8px"></div>
        <div class="actor-list"></div>
      </div>`;

    const machineCard = document.getElementById('machine-assets-card');
    if (machineCard?.parentElement === column) machineCard.insertAdjacentElement('afterend', card);
    else column.insertBefore(card, column.firstChild);

    actorList = card.querySelector('.actor-list');
    actorSummary = card.querySelector('.actor-summary');
    message = card.querySelector('.actor-message');
    createName = card.querySelector('.actor-create-name');
    createModel = card.querySelector('.actor-create-model');
    createDefault = card.querySelector('.actor-create-default');
    createButton = card.querySelector('.actor-create-button');
    secretPanel = card.querySelector('.actor-secret');
    secretToken = card.querySelector('.actor-secret-token');
    secretUrl = card.querySelector('.actor-secret-url');

    card.querySelector('.actor-refresh').addEventListener('click', event => runButton(event.currentTarget, () => refreshAll(true)));

    createButton.addEventListener('click', event => runButton(event.currentTarget, async () => {
      const name = createName.value.trim();
      const model = createModel.value;
      if (!name) throw new Error('Enter an actor name.');
      if (!model) throw new Error('Choose an actor model.');
      const result = await api('/api/actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          model,
          defaultExpression: createDefault.value
        })
      });
      secretPanel.dataset.actorId = result.actor.id;
      showSecret(result, result.actor.name);
      createName.value = '';
      setMessage(`Created ${result.actor.name}. Copy its token and OBS URL now.`);
      await refreshActors(true);
    }));

    card.querySelector('.actor-hide-secret').addEventListener('click', hideSecret);
    card.querySelector('.actor-reveal-token').addEventListener('click', event => {
      const reveal = secretToken.type === 'password';
      secretToken.type = reveal ? 'text' : 'password';
      event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
    });
    card.querySelector('.actor-copy-token').addEventListener('click', event => copyText(secretToken.value, event.currentTarget));
    card.querySelector('.actor-copy-url').addEventListener('click', event => copyText(secretUrl.value, event.currentTarget));

    refreshAll(true);
    schedulePoll();
    return true;
  }

  function initialize() {
    if (buildCard()) return;
    const observer = new MutationObserver(() => {
      if (buildCard()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
