# Device ↔ Hub Protocol (v0.1 — draft)

This is the contract between the **hardware team** (speaker buttons) and the
**software team** (hub).

## Transport

- WebSocket, one connection per button: `ws://<hub>:8000/ws/device/{device_id}`
- `device_id` is a stable, unique string burned into each button (e.g. `btn-07`).
- **Text frames** = JSON control messages.
- **Binary frames** = audio, sent only while the button is held *and* the hub
  granted the floor.

## Audio format

| Field       | Value                        |
|-------------|------------------------------|
| Encoding    | PCM signed 16-bit little-endian (Opus may be added later) |
| Sample rate | 16 000 Hz                    |
| Channels    | 1 (mono)                     |
| Frame size  | 20 ms (640 bytes) recommended |

## Button → Hub

```json
{ "type": "hello", "firmware": "0.1.0", "battery": 87 }
{ "type": "button_down" }
{ "type": "button_up" }
{ "type": "battery", "level": 42 }
```

## Hub → Button

```json
{ "type": "led", "state": "ready" }    // blue    — may press to talk
{ "type": "led", "state": "talking" }  // green   — floor granted, stream audio
{ "type": "led", "state": "waiting" }  // blinking — in the speaking queue
{ "type": "led", "state": "muted" }    // red     — not allowed to talk now
{ "type": "floor_denied", "reason": "busy" }
```

## Connection behaviour (hub v1.2)

- On connect, the hub immediately sends the current LED state: `ready` during a live meeting,
  `muted` when no meeting is live or someone holds the floor in `one_at_a_time` mode.
- If a button reconnects with the same `device_id`, the hub closes the old connection and keeps the new one.
  The old connection is closed with code **4001**: a button that sees 4001 must *not* reconnect
  (it was replaced). After any other drop, buttons should reconnect automatically (every 2 s is a good default).
- If a button disconnects while talking, the audio received so far is still transcribed, and the floor is released.

**Rule:** the button never decides on its own whether it may talk. It sends
`button_down` and waits for `led: talking` before streaming audio. All floor
control logic (free mode, one-at-a-time, queue, chairman) lives in the hub, so
new modes need no firmware change.

## Floor control modes (hub side)

| Mode            | Behaviour |
|-----------------|-----------|
| `free`          | Anyone may talk at any time (up to `max_concurrent`). |
| `one_at_a_time` | Only one speaker; others get `muted` until the floor is free. |
| `queue`         | Others get `waiting`; the floor passes in order of request. |
| `chairman` *(planned)* | The chair grants/revokes the floor from the dashboard. |
