# aethersdr-ulanzi-plugin

[Ulanzi Studio](https://www.ulanzi.com/) plugin that drives [AetherSDR](https://github.com/aethersdr/AetherSDR) — a multi-platform SDR client for FlexRadio transceivers — from a Ulanzi macro keypad or dial.  Bridges the **Ulanzi SDK** (which talks to the physical device over Bluetooth) to **AetherSDR's TCI WebSocket** (the radio control protocol on port 40001).

Tested on the **Ulanzi D100H / KEHWIN Dial_Lite** (6 keys + 1 dial, BLE HOGP).  Should also work with any other Ulanzi-Studio-compatible device — LCD keypads etc — using the keypad actions.

## Actions

18 actions total — D100H profile uses 8 of them (one dial + 7 keys), D200H/D200X profiles fan out to the wider set.

| Action | Controllers | What it does |
|---|---|---|
| **VFO Tune** | Encoder (dial) | Rotate → step the active slice frequency; press+rotate → coarse step (×10/×100/×1000); press → user-configurable (default MOX toggle) |
| **MOX Toggle** | Keypad | Toggle MOX (Manual transmit) on the active slice |
| **TUNE / ATU** | Keypad | Start an internal-ATU tune cycle |
| **Mode Cycle** | Keypad | USB → LSB → CW → DIGU → DIGL → AM → FM → wrap |
| **Mode USB / LSB / CW / DIGU** | Keypad | Direct-set modulation (one action per mode — for devices with enough keys to skip cycling) |
| **Band Up / Band Down** | Keypad | Jump to next higher/lower amateur band |
| **Slice Cycle** | Keypad | A → B → C → … → H → A |
| **RIT Toggle** | Keypad | Toggle Receiver Incremental Tuning on the active slice |
| **AF Gain Up / Down** | Keypad | Step audio (volume) gain ±5 — TCI `volume:` verb |
| **RF Gain Up / Down** | Keypad | Step RF drive (TX power) ±5 — TCI `drive:` verb |
| **Mic Gain Up / Down** | Keypad | Step mic level ±5 — TCI `mic_level:` verb (non-standard; may be silently ignored by AetherSDR) |

Per-action property inspector lets you override the AetherSDR TCI URL, step sizes for VFO, dial-press behaviour, etc.

### Button icons

All 18 action icons are generated programmatically from [`scripts/generate-icons.js`](scripts/generate-icons.js) — pure-Node, zero deps, idempotent.  Edit the `ICONS` list at the top of the script, run `node scripts/generate-icons.js`, and every SVG in `assets/icons/` is rewritten with the AetherSDR theme palette (TX-red, RX-green, band-blue, gain-purple, spectrum-cyan).  Operator can still override per-key with a custom image via Studio's right-click menu.

## Architecture

```
┌─────────────────────┐    BLE      ┌─────────────────────┐    WebSocket    ┌─────────────────────┐
│  Ulanzi D100H /     │ ──────────► │  Ulanzi Studio      │ ──────────────► │  This plugin        │
│  LCD keypad         │             │  (Windows / macOS)  │  127.0.0.1:3906 │  (Node.js)          │
└─────────────────────┘             └─────────────────────┘                 └──────────┬──────────┘
                                                                                       │ WebSocket
                                                                                       │ ws://<host>:40001
                                                                                       ▼
                                                                            ┌─────────────────────┐
                                                                            │  AetherSDR          │
                                                                            │  (TCI server)       │
                                                                            └─────────────────────┘
```

The plugin runs as a Node.js process inside Ulanzi Studio.  Studio loads it via the `CodePath` in `manifest.json` and supplies events (button presses, dial rotations, settings changes).  The plugin maintains one shared WebSocket connection to AetherSDR's TCI server and forwards translated commands.

## Quickstart

1. Clone (or download a release tarball) of this repository.
2. **Symlink or copy** the plugin folder into Ulanzi Studio's plugin directory:
   - Windows: `%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.g0jkn.aethersdr.ulanziPlugin`
   - macOS: `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.g0jkn.aethersdr.ulanziPlugin`

   On Windows the cleanest setup is a directory junction so the in-repo files stay live-edited:
   ```cmd
   mklink /J "%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.g0jkn.aethersdr.ulanziPlugin" ^
              "<path-to-repo>\com.g0jkn.aethersdr.ulanziPlugin"
   ```
3. **Restart Ulanzi Studio** completely (system tray → Quit, then relaunch).
4. **Import the default layout** — Studio Profile menu → Import → pick [`profiles/aethersdr-d100h-default.ulanziDeckProfile`](profiles/README.md).
5. **Launch AetherSDR** (the desktop SDR app) so its TCI server starts listening on port 40001.
6. Press a button on the dial — your radio should respond.

If button presses don't reach the radio, double-check Bluetooth is on and the D100H is connected (top-left of the Studio window).  If the device just dropped its link, see the [reconnect dance](#reconnecting-the-d100h-after-bluetooth-flap) below.

## Status

**Version 0.1.0 — pre-release scaffold.**  Manifest + plugin/app.js + property inspectors stubbed; not yet validated end-to-end with a physical device.  Roadmap:

- [ ] First-light smoke test with D100H + AetherSDR running locally
- [ ] Verify each action sends the right TCI command on press / rotate
- [ ] Property-inspector settings round-trip (URL override, step sizes)
- [ ] LCD button face state updates (TX/RX colour, current mode display, frequency readout)
- [ ] macOS testing
- [ ] Publish to the Ulanzi Studio Marketplace

## Troubleshooting

### Reconnecting the D100H after Bluetooth flap

If the D100H drops its BLE link (host BT toggled off / device came off the charger / host went to sleep / etc) Studio shows the device as disconnected and button presses don't fire.  Standard Windows "remove + re-pair from Settings" is **not** the recovery path — the OS thinks the device is still paired so nothing useful happens.  Instead, do this device-side reset:

1. **Unplug the USB charge lead.**  The device has to be on battery for the pairing UI to come back.
2. **Power the device OFF** (switch on the side).
3. **Wait 10–15 seconds.**  Less and the radio doesn't fully release.
4. **Power back ON.**
5. **Select the correct BT channel** — there are three small indicator LEDs on the underside, each representing one paired host (the device supports 3-way multi-pair).  Pick the one for the shack computer.
6. The device auto-connects to the chosen host within a few seconds; once the BT icon in Ulanzi Studio's top-left shows "Connected", button + dial events start flowing.

### Plugin doesn't appear in Studio's plugin list

Restart Studio **fully** — system tray → Quit, then relaunch.  Studio scans the Plugins directory at startup; just closing the window leaves the cached list in place.

### Plugin appears but actions don't fire

Open AetherSDR — the plugin maintains a WebSocket connection to its TCI server on `ws://127.0.0.1:40001`.  Without AetherSDR running, commands are silently dropped (`[tci] DROPPED (not connected)` in the plugin log).

To see the plugin's live log on Windows:
```cmd
cd %APPDATA%\Ulanzi\UlanziDeck\Plugins\com.g0jkn.aethersdr.ulanziPlugin
node plugin\app.js 127.0.0.1 3906 en-US
```
That replaces Studio's spawned plugin process with one whose stdout you can see.  Useful for debugging.

## License

Apache-2.0 — matches the [Ulanzi SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) (which GitHub's automated SPDX reader mislabels as AGPL-3.0; the actual `LICENSE` file in the SDK is Apache-2.0).

## Author

Nigel Fenton (G0JKN/W3) — built atop the AetherSDR theme-system contributions in [aethersdr/AetherSDR](https://github.com/aethersdr/AetherSDR) and the aether-pad RC-28 / FlexControl emulator work.
