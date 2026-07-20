# AI Actors Control Panel — Phase 2

Phase 2 adds an **AI Actors** card to the secure LAN control panel. It is available only in LAN mode and uses the currently registered machine token.

## What the card can do

- List every actor owned by the current registered machine.
- Create actors from global or private models.
- Rename actors.
- Change the selected model.
- Show the current expression and speaking/idle state.
- Test `neutral`, `happy`, `sad`, `surprised`, and `eyes_closed`.
- Start and stop a speaking test.
- Reset an actor to its configured default expression and idle state.
- Copy the actor ID.
- Regenerate the actor token and OBS URL.
- Delete an actor after confirmation.

## One-time credentials

The server returns the raw actor token only when:

1. an actor is created; or
2. its token is regenerated.

The control panel displays the token and complete OBS URL in a temporary credentials box. Copy them before hiding or refreshing the page. Existing actor rows never expose stored tokens because the server stores only SHA-256 token hashes.

Regenerating a token immediately invalidates the old token and disconnects OBS browser sources using the old URL.

## Creating an actor

1. Open the secure LAN control panel.
2. Find **AI Actors**.
3. Enter an actor name.
4. Choose a model from **Global Models** or **My Models**.
5. Choose the default expression.
6. Select **Create actor**.
7. Copy the one-time actor token and OBS URL.
8. Add the complete URL as an OBS Browser Source.

## Testing an actor

Expression and speaking test controls are authorized by the current machine registration. They do not reveal or replace the actor token.

- Expression buttons switch the connected actor overlay immediately.
- **Test speaking** starts speaking for up to 45 seconds.
- **Idle** force-stops the control-panel speaking test.
- **Reset** returns the actor to its default expression and idle state.

Streamer.bot should continue to use the actor-token API and speech session IDs. The control-panel test endpoints are for the registered machine owner.

## Deleting an actor

Deleting an actor:

- removes its persistent profile from `machine-data/actors.json`;
- clears its in-memory expression and speaking state;
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
```

The original actor-token endpoints remain unchanged:

```text
GET  /api/actors/:actorId/state
POST /api/actors/:actorId/state
POST /api/actors/:actorId/reset
GET  /api/actors/:actorId/assets
```

## Security

- Machine tokens can manage only actors owned by that machine.
- Actor tokens can control only their matching actor.
- Raw actor tokens are never returned by actor listing or profile-update endpoints.
- Complete OBS URLs should be handled like passwords.
