// AetherSDR Controller — Ulanzi Studio plugin
//
// Bridges Ulanzi Studio (which manages the D100H dial / LCD button device
// over Bluetooth) to AetherSDR (the desktop SDR app) via TCI WebSocket on
// port 40001.  Studio sends us button-press + dial events; we translate
// them into TCI commands and ship them to AetherSDR.
//
// Architecture:
//   - $UD = Ulanzi SDK API.  WebSocket client to Studio on 127.0.0.1:3906.
//   - tci = WebSocket client to AetherSDR on ws://<host>:40001.
//   - ACTION_CACHES[context] holds per-button-instance state (each button
//     on the physical device that has an action mapped to it gets a unique
//     context ID from Studio).
//
// All 8 declared action UUIDs route through a single dispatch in onRun /
// the encoder handlers (onDialRotateLeft/Right/HoldLeft/HoldRight/Down/Up).

import UlanziApi from '../libs/common-node/index.js';
import WebSocket from 'ws';

// ─── State ───────────────────────────────────────────────────────────────

const PLUGIN_UUID = 'com.g0jkn.aethersdr.controller';

// Defaults — overridable per-action via property inspector.
const DEFAULT_TCI_URL = 'ws://127.0.0.1:50001';   // AetherSDR TCI server (40001 is for SmartSDR-compat; 50001 is TCI default)

const ACTION_CACHES = {};            // context -> { actionId, settings, ... }
let tci = null;                       // active TCI WebSocket
let tciUrl = DEFAULT_TCI_URL;
let tciReady = false;
let reconnectTimer = 0;

// ─── TCI WebSocket ───────────────────────────────────────────────────────

function tciConnect(url) {
  tciUrl = url || tciUrl;
  if (tci) {
    try { tci.removeAllListeners(); tci.close(); } catch (_) {}
    tci = null;
  }
  console.log(`[tci] connecting to ${tciUrl}`);
  tci = new WebSocket(tciUrl);

  tci.on('open', () => {
    tciReady = true;
    console.log('[tci] connected');
  });
  tci.on('close', () => {
    tciReady = false;
    console.log('[tci] closed — will retry in 5s');
    scheduleReconnect();
  });
  tci.on('error', (err) => {
    console.log(`[tci] error: ${err.message}`);
  });
  tci.on('message', (data) => {
    // Most TCI messages are async state updates we don't yet react to.
    // Logging only at the debug level so the console doesn't drown.
    // console.log(`[tci] <- ${data.toString().trim()}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    tciConnect();
  }, 5000);
}

function tciSend(cmd) {
  if (!tci || !tciReady) {
    console.log(`[tci] DROPPED (not connected): ${cmd}`);
    return false;
  }
  console.log(`[tci] -> ${cmd}`);
  tci.send(cmd);
  return true;
}

// ─── TCI command builders ────────────────────────────────────────────────
// Stub set — minimum viable mapping for first-light smoke test.  Refine
// once we see the actual TCI protocol responses from AetherSDR.

function cmdMoxToggle()     { return `mox:0,toggle;`; }
function cmdTune()          { return `tune:0,1;`; }
function cmdModeNext()      { return `mode:0,next;`; }       // placeholder — TCI may need explicit mode strings
function cmdBandUp()        { return `band_up:0;`; }
function cmdBandDown()      { return `band_down:0;`; }
function cmdSliceNext()     { return `slice:next;`; }
function cmdRitToggle()     { return `rit_enable:0,toggle;`; }

function cmdVfoStep(delta)        { return `vfo:0,${delta > 0 ? '+' : ''}${delta};`; }
function cmdVfoStepCoarse(delta)  { return `vfo:0,${delta > 0 ? '+' : ''}${delta * 10};`; }

// ─── Studio API ──────────────────────────────────────────────────────────

const $UD = new UlanziApi();
$UD.connect(PLUGIN_UUID);

$UD.onConnected(() => {
  console.log(`[studio] connected as ${PLUGIN_UUID}`);
  tciConnect();
});

$UD.onClose(() => { console.log('[studio] disconnected'); });
$UD.onError((err) => { console.log(`[studio] error: ${err}`); });

// Per-button lifecycle
$UD.onAdd((jsn) => {
  const ctx = jsn.context;
  ACTION_CACHES[ctx] = {
    actionId: jsn.action,
    settings: jsn.param || {},
  };
  // Settings may include an override for the TCI URL — apply globally if set.
  if (jsn.param && jsn.param.tci_url && jsn.param.tci_url !== tciUrl) {
    tciConnect(jsn.param.tci_url);
  }
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) {
    delete ACTION_CACHES[item.context];
  }
});

$UD.onParamFromPlugin((jsn) => {
  const ctx = jsn.context;
  if (ACTION_CACHES[ctx]) {
    ACTION_CACHES[ctx].settings = jsn.param || {};
  }
  if (jsn.param && jsn.param.tci_url && jsn.param.tci_url !== tciUrl) {
    tciConnect(jsn.param.tci_url);
  }
});

// Keypad — button press
$UD.onRun((jsn) => {
  const cache = ACTION_CACHES[jsn.context];
  if (!cache) return;
  switch (cache.actionId) {
    case `${PLUGIN_UUID}.mox`:         tciSend(cmdMoxToggle());  break;
    case `${PLUGIN_UUID}.tune`:        tciSend(cmdTune());       break;
    case `${PLUGIN_UUID}.modeCycle`:   tciSend(cmdModeNext());   break;
    case `${PLUGIN_UUID}.bandUp`:      tciSend(cmdBandUp());     break;
    case `${PLUGIN_UUID}.bandDown`:    tciSend(cmdBandDown());   break;
    case `${PLUGIN_UUID}.sliceCycle`:  tciSend(cmdSliceNext());  break;
    case `${PLUGIN_UUID}.ritToggle`:   tciSend(cmdRitToggle());  break;
    default:
      console.log(`[run] unhandled action: ${cache.actionId}`);
  }
});

// Encoder (D100H dial) — only the vfo action lives on the dial.
$UD.onDialRotateRight(()       => tciSend(cmdVfoStep(+1)));
$UD.onDialRotateLeft(()        => tciSend(cmdVfoStep(-1)));
$UD.onDialRotateHoldRight(()   => tciSend(cmdVfoStepCoarse(+1)));
$UD.onDialRotateHoldLeft(()    => tciSend(cmdVfoStepCoarse(-1)));
$UD.onDialDown(()              => tciSend(cmdMoxToggle()));  // default — overridable in inspector
$UD.onDialUp(()                => {});                       // ignore release

// ─── Misc ────────────────────────────────────────────────────────────────
// Surface unhandled crashes instead of silently dying.
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));
process.on('uncaughtException',  (err) => console.error('[crash]', err));
