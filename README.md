# ⚔️ AS Adventurer

**A free, open-source reactive overlay for streamers.** AS Adventurer bridges the gap between PNGtubing and VTube Studio — giving you expression-reactive characters without the cost or complexity of a full Live2D setup.

It's not meant to replace either. If you need full Live2D rigging, use VTube Studio. If you just want a static PNG that bounces, use a PNGtuber tool. AS Adventurer sits in the middle — **animated expression swaps driven by real facial tracking**.

It also works well for **Discord collab reactives** and dedicated **AI Actor** overlays controlled from Streamer.bot.

> Built by [Angel's Sword Studios](https://github.com/angelssword). Designed for creators on a budget.

---

## What It Does

Your iPhone or webcam tracks your face. AS Adventurer reads your expressions in real time and swaps between different animations on stream:

| Expression | What Triggers It |
|:-----------|:-----------------|
| 😊 Happy | Smiling (cheek + eye squint) |
| 😢 Sad | Frowning (brow + mouth) |
| 😮 Surprised | Wide eyes + raised brows |
| 😑 Eyes Closed | Eyes shut for 1.5+ seconds |
| 🎤 Speaking | Microphone volume or actor TTS state |
| ⌨️ Typing | Keyboard activity |

Each state can have its own idle and speaking animation. You provide the art — WebM, GIF, PNG, WebP, or MP4 — and AS Adventurer handles the rest.

### Emotes

On top of expressions, you can trigger **emotes** from the control panel — one-shot animations, held poses with intro/idle/outro sequences, and nested sub-animations such as draw sword → ignite → slash. Each emote can have sound effects and multiple variants that play randomly.

### Secure LAN mode and AI Actors

The standard launcher remains localhost-only. The opt-in secure LAN launcher adds HTTPS, secure WebSockets, per-machine registration, private model uploads, authenticated OBS URLs, and dedicated AI Actor overlays.

AI Actors can be controlled from the LAN control panel or through the reusable Streamer.bot helper. Actor expression, speech sessions, models, emotes, and connections are isolated by actor ID and actor token.

---

## Features

- **Face tracking** — VTube Studio (iPhone), iFacialMocap (iPhone), or webcam via MediaPipe
- **Voice detection** — microphone input with adjustable threshold
- **Typing detection** — keyboard activity triggers a typing animation
- **Multiple models** — switch characters on the fly from the control panel
- **Emote system** — one-shot, held, and nested sub-animation emotes with sound effects
- **AI Actors** — dedicated OBS overlays with actor-scoped expression, speech, reset, and emote controls
- **Streamer.bot helper** — reusable methods for TTS sessions, expressions, reset, emotes, and sub-emotes
- **Secure LAN mode** — HTTPS, machine registration, shared global models, and isolated private assets
- **Tunable thresholds** — smile sensitivity, expression hold, hysteresis, exit bias, transition speed
- **Crossfade / blur-pop transitions** — configurable swap animation between expression states
- **OBS-native** — transparent browser source, no plugins needed
- **Recovery-aware** — bounded asset retries and overlay reconnection recovery
- **Resource-aware** — inactive and hidden videos are paused and removed media is detached
- **Standalone EXE** — build a portable release with no runtime dependencies
- **Local by default** — standard mode is localhost-only; LAN mode is explicit and intended for trusted private networks

---

## Quick Start

### Standard localhost mode from source

```bash
# Clone the repo
git clone https://github.com/angelssword/as-adventurer.git
cd as-adventurer

# Install dependencies
npm install

# Start the localhost server
npm start
```

Then open:

- **Control Panel** → `http://localhost:3000`
- **OBS Overlay** → `http://localhost:3000/overlay.html`

### Secure LAN mode from source

```bash
npm install
npm run start:lan
```

LAN mode prints certificate-valid HTTPS addresses. When the browser, OBS, Streamer.bot, and server are on the same computer, use:

```text
https://localhost:3000
```

Remote computers must trust the generated LAN root certificate and use a hostname or IP address included in the certificate. See [LAN_SETUP.md](LAN_SETUP.md).

### From a release without Node.js

1. Download and extract the release ZIP.
2. Use `Start AS Adventurer.bat` for ordinary localhost mode.
3. Use `Start AS Adventurer LAN.bat` for secure LAN mode.
4. Follow the printed address and setup instructions.

---

## Adding Your Character

Drop your animations into `public/assets/` — either at the root for a single model, or in a subfolder for multiple models.

In secure LAN mode, host-managed models in `public/assets/` are shared read-only **Global Models**. Registered machines can also upload private **My Models** content under `machine-data/assets/<machine-id>/`.

### File Naming

```text
public/assets/
  MyCharacter/
    neutral_idle.webm          ← Default resting state
    neutral_speaking.webm      ← Talking, neutral expression
    happy_idle.webm            ← Smiling
    happy_speaking.webm        ← Talking while smiling
    sad_idle.webm              ← Frowning
    sad_speaking.webm          ← Talking while frowning
    surprised_idle.webm        ← Surprised
    surprised_speaking.webm    ← Talking while surprised
    eyes_closed.webm           ← Eyes shut
    typing.webm                ← Keyboard typing
```

Only `neutral_idle` is truly required. Everything else is optional — when a state has no asset, AS Adventurer falls back gracefully.

**Supported animation formats:** `.webm` `.mp4` `.webp` `.gif` `.png`

### Emotes

```text
public/assets/MyCharacter/emotes/
  wave/
    animation.webm              ← One-shot emote (Type 1)

  sword_draw/
    intro.webm                  ← Plays once on trigger
    idle.webm                   ← Loops while held
    speaking.webm               ← Loops while held + talking
    outro.webm                  ← Plays on release
    intro_sound.mp3             ← Sound on trigger
    outro_sound.mp3             ← Sound on release
    subs/
      ignition/                 ← Sub-animation
        intro.webm
        idle.webm
        subs/
          slash/
            animation.webm     ← One-shot, returns to parent
            sound.mp3
```

Emotes support variants — `intro.webm`, `intro2.webm`, and `intro3.webm` can be selected randomly.

---

## Connecting Face Tracking

### VTube Studio (iPhone)

1. Open VTube Studio → Settings → 3rd Party PC Clients → Enable.
2. In the Control Panel, enter your iPhone's IP and select **Connect VTS**.
3. Keep the phone and PC on the same Wi-Fi network.

### iFacialMocap (iPhone)

1. Open iFacialMocap on your iPhone.
2. In the Control Panel, enter your iPhone's IP and select **Connect iFacial**.

### Microphone

1. Select your microphone from the Control Panel.
2. Select **Enable Microphone**.
3. Keep the Control Panel tab open while streaming.

---

## OBS Setup

### Standard overlay

1. Add an **OBS Browser Source**.
2. URL: `http://localhost:3000/overlay.html`
3. Set width and height to match the character dimensions.
4. Leave the background transparent.

Debug mode: `http://localhost:3000/overlay.html?debug=1`

### Secure LAN and actor overlays

Copy the complete authenticated OBS URL from the secure control panel. Do not share it publicly because the URL fragment contains a credential.

For an AI Actor, create the actor in the **AI Actors** card and copy its one-time OBS URL. On the same computer, keep the complete path and fragment but use the certificate-valid `https://localhost:3000` origin.

See [AI_ACTOR_CONTROL_PANEL.md](AI_ACTOR_CONTROL_PANEL.md) for actor setup and [STREAMERBOT_AI_ACTORS.md](STREAMERBOT_AI_ACTORS.md) for Streamer.bot controls.

---

## Ports

| Port | Protocol | Purpose |
|:-----|:---------|:--------|
| 3000 | HTTP/WS or HTTPS/WSS | Web server and WebSocket |
| 21412 | UDP | VTube Studio send |
| 11125 | UDP | VTube Studio receive |
| 49983 | UDP | iFacialMocap |

---

## Building a Release

Create the standard standalone release:

```bash
node build-release.js
```

Create a release containing both the standard and secure LAN launchers:

```bash
npm run build-release:lan
```

The build creates `release/ASAdventurer/` plus `release/ASAdventurer.zip`. The LAN-enabled package also includes certificate setup, LAN and actor guides, and the Streamer.bot helper source.

---

## Documentation

- [LAN_SETUP.md](LAN_SETUP.md) — secure LAN setup, registration, private assets, OBS, certificates, backups, and release builds
- [AI_ACTOR_CONTROL_PANEL.md](AI_ACTOR_CONTROL_PANEL.md) — actor creation, credentials, emotes, recovery, endpoints, and security
- [STREAMERBOT_AI_ACTORS.md](STREAMERBOT_AI_ACTORS.md) — helper installation, TTS sessions, expressions, emotes, outputs, validation, and troubleshooting
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — how project status and roadmap records are maintained
- [project-status.json](project-status.json) — completed work, live validation, and known limits
- [next-steps.json](next-steps.json) — ordered roadmap with blockers and acceptance criteria
- [CHANGELOG.md](CHANGELOG.md) — user-visible additions, changes, fixes, validation, and pending release gates

---

## Tech Stack

- **Server:** Node.js, Express, WebSocket (`ws`)
- **Tracking:** UDP sockets for VTube Studio and iFacialMocap protocol parsing
- **Frontend:** Vanilla HTML, CSS, and JavaScript
- **Packaging:** `pkg` for standalone Windows executable builds
- **Automation integration:** Streamer.bot inline C# using `HttpClient` and `Newtonsoft.Json`

---

## License

MIT — free for personal and commercial use. See [LICENSE](LICENSE) for details.

---

## Contributing

This project is open source because everyone should be able to create, regardless of budget. Pull requests for fixes, features, tests, and documentation are welcome.

When contributing, update `project-status.json`, `next-steps.json`, and `CHANGELOG.md` when the change affects project state or user-visible behavior. Never commit machine tokens, actor tokens, authenticated OBS URLs, certificate private keys, or certificate password files.

If you find this useful, consider crediting **Angel's Sword Studios** in your stream setup. 💛
