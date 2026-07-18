# Running AS Adventurer on another computer

AS Adventurer remains localhost-only by default. Secure LAN mode is an explicit launcher for trusted home or private networks.

## Why HTTPS is required

Browsers expose camera and microphone capture only to secure pages. `http://localhost` is treated as secure on the same computer, but a LAN address such as `http://192.168.1.25:3000` is not. On an insecure LAN page, `navigator.mediaDevices` is unavailable and the control panel cannot request permission.

Secure LAN mode solves this by serving the control panel over HTTPS and using secure WebSockets.

## Typical setup

- **Host computer:** runs AS Adventurer and stores the character assets.
- **Second computer:** opens the control panel, supplies its camera/microphone, or uses the overlay as an OBS Browser Source.
- Both computers must be connected to the same trusted local network.

## Start secure LAN mode

From source:

```bash
npm run start:lan
```

On Windows, you can instead double-click:

```text
start-lan.bat
```

The first Windows launch creates a private certificate under `lan-cert/`, installs its root certificate for the current host account, and prints HTTPS addresses such as:

```text
Control Panel:  https://192.168.1.25:3000
OBS Overlay:    https://192.168.1.25:3000/overlay.html
```

The launcher also prints a hostname address. Prefer the hostname address when it resolves on the second computer because it continues working if the host receives a different IP address.

## Trust the certificate on the second computer

Camera and microphone permission will not work until the second computer trusts the generated root certificate.

1. On the host, start LAN mode once so the `lan-cert/` folder is created.
2. Copy the entire `lan-cert/` folder to the second Windows computer using a trusted method such as a private network share or USB drive.
3. On the second computer, run `Install Certificate on this PC.bat` from that folder.
4. Close all browser windows and reopen the printed `https://` Control Panel address.
5. Grant camera and microphone permission when the browser prompts.

Only `ASAdventurer-LAN-Root.cer` is meant to be shared. Keep the server `.pfx` and password file private on the host.

If the browser still reports that the connection is not secure, confirm that the address exactly matches one printed by the launcher and that the certificate was installed under **Trusted Root Certification Authorities** for the current Windows user.

## Standalone release

Build the release with secure LAN support:

```bash
npm run build-release:lan
```

or double-click `build-release-with-lan.bat`.

The release contains two launchers:

- `Start AS Adventurer.bat` — localhost-only mode.
- `Start AS Adventurer LAN.bat` — HTTPS trusted-network mode.

## Non-Windows hosts

Set these environment variables before running `npm run start:lan`:

```text
AS_ADVENTURER_HTTPS_PFX=/path/to/server.pfx
AS_ADVENTURER_HTTPS_PASSPHRASE=your-pfx-password
```

The certificate must contain the host name or LAN IP address used by the client and must chain to a root certificate trusted by the client browser. If no PFX is available, LAN mode falls back to HTTP, but browsers will not expose camera or microphone devices.

## Windows Firewall

The first LAN launch may trigger a Windows Firewall prompt. Allow access on **Private networks**. Avoid enabling access on Public networks.

If no prompt appears and the second computer cannot connect, allow `node.exe`, `ASAdventurerLAN.exe`, or TCP port `3000` through Windows Defender Firewall for Private networks.

## OBS notes

OBS can use the printed HTTPS overlay URL. If OBS rejects the certificate, install the generated root certificate on the OBS computer using the same installer and restart OBS.

## Security

LAN mode has no login screen. Anyone who can reach the host computer on that network can operate the control panel and trigger its API actions.

Use LAN mode only on a trusted private network. Stop the server when it is not needed, do not forward port `3000` from your router, and do not share the server `.pfx` or password file.
