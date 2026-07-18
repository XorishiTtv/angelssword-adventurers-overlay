# Running AS Adventurer on another computer

AS Adventurer remains localhost-only by default. LAN mode is an explicit launcher for trusted home or private networks.

## Typical setup

- **Host computer:** runs AS Adventurer and stores the character assets.
- **Second computer:** opens the control panel or uses the overlay as an OBS Browser Source.
- Both computers must be connected to the same local network.

## From source

Install dependencies normally, then run either:

```bash
npm run start:lan
```

On Windows, you can instead double-click:

```text
start-lan.bat
```

The console prints one or more network URLs, for example:

```text
Control Panel:  http://192.168.1.25:3000
OBS Overlay:    http://192.168.1.25:3000/overlay.html
```

Open the printed address on the second computer. Do not use `localhost` there; `localhost` always refers to the computer you are currently using.

## Standalone release

Build the release with LAN support:

```bash
npm run build-release:lan
```

or double-click `build-release-with-lan.bat`.

The release contains two launchers:

- `Start AS Adventurer.bat` — localhost-only mode.
- `Start AS Adventurer LAN.bat` — trusted-network LAN mode.

## Windows Firewall

The first LAN launch may trigger a Windows Firewall prompt. Allow access on **Private networks**. Avoid enabling access on Public networks.

If no prompt appears and the second computer cannot connect, allow `node.exe`, `ASAdventurerLAN.exe`, or TCP port `3000` through Windows Defender Firewall for Private networks.

## Camera and microphone note

The overlay, emote controls, manual state controls, model selection, VTube Studio, and iFacialMocap can be used across the LAN.

Most browsers do not allow camera or microphone capture from a plain `http://192.168.x.x` page. For webcam or microphone tracking, keep the control panel open on the host computer at `http://localhost:3000`, and use the second computer for the OBS overlay.

## Security

LAN mode has no login screen. Anyone who can reach the host computer on that network can operate the control panel and trigger its API actions.

Use LAN mode only on a trusted private network. Stop the server when it is not needed, and do not forward port `3000` from your router to the internet.
