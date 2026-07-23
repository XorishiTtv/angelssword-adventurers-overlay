# AI Actors Control Panel — Phase 2

Phase 2 adds an **AI Actors** card to the secure LAN control panel. It is available only in LAN mode and uses the currently registered machine token.

## What the card can do

- List every actor owned by the current registered machine.
- Create actors from global or private models.
- Rename actors and change their selected model.
- Show expression, speaking/idle state, and the active emote.
- Test `neutral`, `happy`, `sad`, `surprised`, and `eyes_closed`.
- Start and stop a speaking test.
- Trigger and release actor emotes.
- Trigger nested actor sub-animations.
- Reset an actor to its configured default expression, idle state, and no active emote.
- Copy the actor ID.
- Regenerate the actor token and OBS URL.
- Delete an actor after confirmation.

## One-time credentials

The server returns the raw actor token only when an actor is created or its token is regenerated.

The control panel displays the token and complete OBS URL in a temporary credentials box. Copy them before hiding or refreshing the page. Existing actor rows never expose stored tokens because the server stores only SHA-256 token hashes.

Regenerating a token immediately invalidates the old token, releases its active emote, and disconnects OBS browser sources using the old URL.

## Creating an actor

1. Open the secure LAN control panel.
2. Find **AI Actors**.
3. Enter an actor name.
4. Choose a model from **Global Models** or **My Models**.
5. Choose the default expression.
6. Select **Create actor**.
7. Copy the one-time actor token and OBS URL.
8. Add the complete URL as an OBS Browser Source.

When OBS and the LAN server run on the same computer, prefer the certificate-valid `https://localhost:3000` origin.

## Testing expression and speech

Expression and speaking test controls are authorized by the current machine registration. They do not reveal or replace the actor token.

- Expression buttons switch the connected actor overlay immediately.
- **Test speaking** starts speaking for up to 45 seconds.
- **Idle** force-stops the control-panel speaking test.
- **Reset** returns the actor to its default expression, idle state, and no active emote.

Streamer.bot should continue to use the actor-token API and speech session IDs. The control-panel test endpoints are for the registered machine owner.

## Actor emotes

Actor overlays reuse the existing AS Adventurer emote renderer and folder conventions.

Place emotes inside the selected model:

```text
<Model>/
  emotes/
    wave/
      animation.webm
```

A Type 1 emote uses `animation.*`.

A Type 2 emote can use:

```text
<Model>/
  emotes/
    campfire/
      intro.webm
      idle.webm
      speaking.webm
      outro.webm
      intro_sound.mp3
      idle_sound.mp3
      outro_sound.mp3
      subs/
        sparks/
          animation.webm
          sound.wav
```

The card lists emotes for each actor's selected model. Select an emote and use **Trigger** or **Release**. Nested sub-animations appear as slash-separated paths and can be triggered only while their parent emote is active.

Machine-owned emote triggers use short-lived, actor-scoped signed media URLs. The control panel never needs or receives the raw actor token.

Changing an actor's model, resetting it, regenerating its token, or deleting it releases the active emote.

## Streamer.bot helper

The reusable helper is located at:

```text
streamerbot/ASAdventurerActorHelper.cs
```

It provides:

- `StartTts()`
- `StopTts()`
- `SetExpression()`
- `ResetActor()`
- `TriggerEmote()`
- `ReleaseEmote()`
- `TriggerSubEmote()`

See `STREAMERBOT_AI_ACTORS.md` for installation, arguments, token storage, outputs, emote actions, and multi-bot setup.

The helper uses the actor ID and actor token. It does not use the machine token or machine-owner endpoints.

## Deleting an actor

Deleting an actor:

- removes its persistent profile from `machine-data/actors.json`;
- clears its in-memory expression, speaking, and active-emote state;
- cancels its speaking timer;
- disconnects its OBS actor sockets; and
- permanently invalidates its actor token.

Deleting an actor does not delete the selected global or private model files.

## Management endpoints

All management endpoints require the owning machine token.

```text
GET    /api/actors
GET    /api/actors/models
POST   /api/actors
PATCH  /api/actors/:actorId
DELETE /api/actors/:actorId
POST   /api/actors/:actorId/token/regenerate
POST   /api/actors/:actorId/manage/state
POST   /api/actors/:actorId/manage/reset
GET    /api/actors/:actorId/manage/emotes
POST   /api/actors/:actorId/manage/emote/trigger
POST   /api/actors/:actorId/manage/emote/release
POST   /api/actors/:actorId/manage/emote/sub
```

Actor-token endpoints:

```text
GET  /api/actors/:actorId/state
POST /api/actors/:actorId/state
POST /api/actors/:actorId/reset
GET  /api/actors/:actorId/assets
GET  /api/actors/:actorId/emotes
POST /api/actors/:actorId/emote/trigger
POST /api/actors/:actorId/emote/release
POST /api/actors/:actorId/emote/sub
```

## Security

- Machine tokens can manage only actors owned by that machine.
- Actor tokens can control only their matching actor.
- Raw actor tokens are never returned by actor listing, profile-update, or machine-owned emote endpoints.
- Machine-owned emote media links are HMAC-signed, actor/model/path scoped, short-lived, and invalidated by token regeneration.
- Complete OBS URLs and actor tokens should be handled like passwords.
