# Running AS Adventurer on another computer

AS Adventurer remains localhost-only by default. Secure LAN mode is an explicit launcher for trusted home or private networks.

## Why HTTPS is required

Browsers expose camera and microphone capture only to secure pages. `http://localhost` is treated as secure on the same computer, but a LAN address such as `http://192.168.1.25:3000` is not. Secure LAN mode serves the control panel over HTTPS and uses secure WebSockets so the remote browser can request camera and microphone permission.

## Machine registrations and private assets

Every computer that uses secure LAN mode registers as a separate logical machine. Registration creates:

- a random machine token, stored in that browser;
- a private machine record under `machine-data/registry.json`;
- a private asset directory under `machine-data/assets/<machine-id>/`.

The raw token is shown to the registered browser and is stored only as a hash on the server. Treat the token like a password. Anyone who copies it can impersonate that logical machine.

Machine-scoped APIs, WebSockets, model selection, emotes, uploads, and asset files require the token. A registered machine cannot list, select, download, or delete another machine's assets. The standard localhost launcher continues using `public/assets/` and is unchanged.

## Typical setup

- **Host computer:** runs AS Adventurer and stores certificates plus machine asset data.
- **LAN/overlay computer:** opens the control panel, registers itself, supplies its camera/microphone, uploads its own models, and copies its authenticated OBS URL.
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

Prefer the printed hostname address when it resolves on the LAN computer because it continues working if the host receives a different IP address.

## Trust the certificate on each LAN computer

Camera and microphone permission will not work until the LAN computer trusts the generated root certificate.

1. On the host, start LAN mode once so the `lan-cert/` folder is created.
2. Copy the `lan-cert/` folder to the LAN Windows computer using a trusted private share or USB drive.
3. Run `Install Certificate on this PC.bat` there once.
4. Close all browser and OBS windows.
5. Reopen a printed `https://` Control Panel address.

Only `ASAdventurer-LAN-Root.cer` is intended to be shared. Keep the server `.pfx` and password file private on the host.

## Register the LAN computer

1. Open the secure Control Panel on the LAN computer.
2. Enter a descriptive name such as `Streaming PC` or `Collab Laptop`.
3. Select **Create machine token**.
4. Keep the token private. The browser stores it locally and the Machine Assets card can copy it when needed.
5. Use **Use existing token** only when restoring that same logical registration in another browser profile.

The token is not cryptographically tied to physical hardware. It is the credential that represents the machine. Copying it grants the same access.

## Upload private machine assets

The **Machine Assets** card supports two upload methods:

- **Complete model folder:** select a folder containing `neutral_idle`, expression states, and optional `emotes/`. The top-level folder becomes the model name.
- **Files to a destination folder:** enter a path such as `MyCharacter` or `MyCharacter/emotes/wave`, then select one or more files.

Supported upload types are `.webm`, `.webp`, `.gif`, `.png`, `.mp4`, `.mp3`, `.wav`, `.ogg`, and `.m4a`. Each file is limited to 250 MB. Uploaded files can be reviewed and deleted from the same card.

The model selector refreshes automatically. Only models inside the current machine's private directory are returned in secure LAN mode.

## OBS setup

Copy the OBS URL from the registered Control Panel. It contains the machine token in the URL fragment, for example:

```text
https://overlay-host:3000/overlay.html#machine_token=...
```

The fragment is read by the browser client and attached to authenticated API and WebSocket requests. Do not share the full OBS URL publicly.

If OBS rejects the certificate, install the generated root certificate on the OBS computer and restart OBS.

## Backups and lost tokens

Back up the complete `machine-data/` directory to preserve registrations and uploaded assets. The registry stores only token hashes, so a lost raw token cannot be recovered from the server. Register a new machine and re-upload or move the files on the host if a token is lost.

## Standalone release

Build the release with secure LAN support:

```bash
npm run build-release:lan
```

or double-click `build-release-with-lan.bat`.

The release contains two launchers:

- `Start AS Adventurer.bat` — localhost-only mode using `public/assets/`.
- `Start AS Adventurer LAN.bat` — HTTPS, token-authenticated machine mode using `machine-data/`.

## Non-Windows hosts

Set these environment variables before running `npm run start:lan`:

```text
AS_ADVENTURER_HTTPS_PFX=/path/to/server.pfx
AS_ADVENTURER_HTTPS_PASSPHRASE=your-pfx-password
```

The certificate must contain the host name or LAN IP address used by the client and must chain to a root certificate trusted by the client browser. Without a PFX, LAN mode falls back to HTTP, where camera and microphone devices remain unavailable.

## Windows Firewall

Allow access on **Private networks** only. If no prompt appears and the LAN computer cannot connect, allow `node.exe`, `ASAdventurerLAN.exe`, or TCP port `3000` through Windows Defender Firewall for Private networks.

## Security

Secure LAN mode requires machine tokens but does not protect against an untrusted person who obtains a token or controls the host computer. Use it only on a trusted private network, stop the server when it is not needed, and do not forward port `3000` through the router.

Never share or commit `lan-cert/` or `machine-data/`. The repository ignores both directories.
