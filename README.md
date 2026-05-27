# aethersdr-ulanzi-plugin

[Ulanzi Studio](https://www.ulanzi.com/) plugin that drives [AetherSDR](https://github.com/aethersdr/AetherSDR) — a multi-platform SDR client for FlexRadio transceivers — from a Ulanzi macro keypad or dial.  Bridges the **Ulanzi SDK** (which talks to the physical device over Bluetooth) to **AetherSDR's TCI WebSocket** (the radio control protocol on port 50001).

Tested on the **Ulanzi D100H / KEHWIN Dial_Lite** (6 keys + 1 dial, BLE HOGP).  Should also work with any other Ulanzi-Studio-compatible device — LCD keypads etc — using the keypad actions.

## Actions

| Action | Controllers | What it does |
|---|---|---|
| **VFO Tune** | Encoder (dial) | Rotate → step the active slice frequency; press+rotate → coarse step (×10/×100/×1000); press → user-configurable (default MOX toggle) |
| **MOX Toggle** | Keypad | Toggle MOX (Manual transmit) on the active slice |
| **TUNE / ATU** | Keypad | Start an internal-ATU tune cycle |
| **Mode Cycle** | Keypad | USB → LSB → CW → DIGU → DIGL → AM → FM → wrap |
| **Band Up / Band Down** | Keypad | Jump to next higher/lower amateur band |
| **Slice Cycle** | Keypad | A → B → C → … → H → A |
| **RIT Toggle** | Keypad | Toggle Receiver Incremental Tuning on the active slice |

Per-action property inspector lets you override the AetherSDR TCI URL, step sizes for VFO, dial-press behaviour, etc.

## Architecture

```
┌─────────────────────┐    BLE      ┌─────────────────────┐    WebSocket    ┌─────────────────────┐
│  Ulanzi D100H /     │ ──────────► │  Ulanzi Studio      │ ──────────────► │  This plugin        │
│  LCD keypad         │             │  (Windows / macOS)  │  127.0.0.1:3906 │  (Node.js)          │
└─────────────────────┘             └─────────────────────┘                 └──────────┬──────────┘
                                                                                       │ WebSocket
                                                                                       │ ws://<host>:50001
                                                                                       ▼
                                                                            ┌─────────────────────┐
                                                                            │  AetherSDR          │
                                                                            │  (TCI server)       │
                                                                            └─────────────────────┘
```

The plugin runs as a Node.js process inside Ulanzi Studio.  Studio loads it via the `CodePath` in `manifest.json` and supplies events (button presses, dial rotations, settings changes).  The plugin maintains one shared WebSocket connection to AetherSDR's TCI server and forwards translated commands.

## Status

**Version 0.1.0 — pre-release scaffold.**  Manifest + plugin/app.js + property inspectors stubbed; not yet validated end-to-end with a physical device.  Roadmap:

- [ ] First-light smoke test with D100H + AetherSDR running locally
- [ ] Verify each action sends the right TCI command on press / rotate
- [ ] Property-inspector settings round-trip (URL override, step sizes)
- [ ] LCD button face state updates (TX/RX colour, current mode display, frequency readout)
- [ ] macOS testing
- [ ] Publish to the Ulanzi Studio Marketplace

## License

Apache-2.0 — matches the [Ulanzi SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) (which GitHub's automated SPDX reader mislabels as AGPL-3.0; the actual `LICENSE` file in the SDK is Apache-2.0).

## Author

Nigel Fenton (G0JKN/W3) — built atop the AetherSDR theme-system contributions in [aethersdr/AetherSDR](https://github.com/aethersdr/AetherSDR) and the aether-pad RC-28 / FlexControl emulator work.
