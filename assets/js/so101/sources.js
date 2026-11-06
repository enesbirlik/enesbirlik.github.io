/* Joint-angle sources for the SO-101 viewer.

   A source is a plain object:
     id      short name: "idle" (now), later "replay" / "live"
     label   text for the corner status tag (e.g. "● LIVE", "REPLAY"), or null to hide it
     start() called once before the first read(); may return a Promise
             (fetch a recording, open a socket). A rejection makes the viewer fall back to idle.
     stop()  release timers / connections
     read(t) joint angles in radians at time t (seconds since start), keyed by URDF joint name.
             Joints left out keep their last value; return null to hold the whole pose.

   Planned source, same shape:
     replay  start(): fetch data/replays/<name>.json  ({ joints: [...], frames: [[t, a1, a2, ...], ...] })
             read(t): interpolate the frame at t % duration

   Live: while I work with the robot, scripts/so101_live_bridge.py streams /joint_states to a
   public MQTT broker. watchLive() listens (read-only) while the card is on screen and switches
   the viewer to the live source when messages arrive, back to idle when they stop. */

// "New calibration" URDF: every joint's zero is the middle of its range.
export const HOME_POSE = {
  shoulder_pan: 0,
  shoulder_lift: 0.4,
  elbow_flex: -0.45,
  wrist_flex: 0.7,
  wrist_roll: 0,
  gripper: 0.35
};

// Gentle, non-repeating-looking sway around a pose: a few slow sines per joint.
const SWAY = {
  shoulder_pan: [0.22, 0.11, 0.0],
  shoulder_lift: [0.07, 0.17, 1.3],
  elbow_flex: [0.09, 0.13, 2.1],
  wrist_flex: [0.10, 0.19, 0.6],
  wrist_roll: [0.18, 0.09, 2.7],
  gripper: [0.12, 0.31, 1.9]
};

export function createIdleSource(pose = HOME_POSE) {
  return {
    id: "idle",
    label: null,
    start() {},
    stop() {},
    read(t) {
      const out = {};
      for (const name in pose) {
        const [amp, freq, phase] = SWAY[name] || [0, 0, 0];
        const w = 2 * Math.PI * freq;
        out[name] = pose[name] + amp * (0.7 * Math.sin(w * t + phase) + 0.3 * Math.sin(2.3 * w * t + 2 * phase));
      }
      return out;
    }
  };
}

/* ---------- Live (MQTT over WebSocket) ---------- */

export const LIVE = {
  url: "wss://broker.hivemq.com:8884/mqtt",   // public broker, see scripts/so101_live_bridge.py
  topic: "enesbirlik/so101/live/v1/joints",
  staleAfter: 3,                              // s without a message: back to idle
  follow: 12                                  // 1/s, how fast the model follows a new message
};

// The broker is public, so anyone could publish: only known joints with sane values count.
function parseLive(payload) {
  let msg;
  try {
    msg = JSON.parse(new TextDecoder().decode(payload));
  } catch (e) {
    return null;
  }
  if (!msg || typeof msg.q !== "object") return null;
  const q = {};
  for (const name in HOME_POSE) {
    const v = msg.q[name];
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 3.2) q[name] = v;
  }
  return Object.keys(q).length ? q : null;
}

export function createLiveSource() {
  let target = null, shown = null, last = 0;
  return {
    id: "live",
    label: "● LIVE",
    start() {},
    stop() {},
    push(q) {
      target = { ...(target || {}), ...q };
    },
    // ~10 Hz messages, ~60 Hz frames: ease towards the latest one instead of jumping
    read(t) {
      if (!target) return null;
      const dt = Math.min(Math.max(t - last, 0), 0.1);
      last = t;
      if (!shown) shown = { ...target };
      const k = 1 - Math.exp(-LIVE.follow * dt);
      for (const name in target) shown[name] = (shown[name] ?? target[name]) + (target[name] - (shown[name] ?? target[name])) * k;
      return shown;
    }
  };
}

// Listens only while the card is on screen (setActive); returns { setActive(on), dispose() }.
export function watchLive(viewer, idle) {
  let client = null, live = null, lastMsg = 0, timer = 0, disposed = false;

  async function connect() {
    if (client || disposed) return;
    const mqtt = (await import("mqtt")).default;
    if (disposed) return;
    client = mqtt.connect(LIVE.url, { reconnectPeriod: 10000, connectTimeout: 8000, clean: true });
    client.on("connect", () => client.subscribe(LIVE.topic, { qos: 0 }));
    client.on("message", (topic, payload) => {
      const q = parseLive(payload);
      if (!q) return;
      lastMsg = performance.now();
      if (!live) {
        live = createLiveSource();
        viewer.setSource(live);
      }
      live.push(q);
    });
    client.on("error", (e) => console.warn("SO-101 live:", e && e.message));
    timer = setInterval(() => {
      if (live && performance.now() - lastMsg > LIVE.staleAfter * 1000) {
        live = null;
        viewer.setSource(idle());
      }
    }, 1000);
  }

  function disconnect() {
    clearInterval(timer);
    if (client) client.end(true);
    client = null;
    if (live) {
      live = null;
      viewer.setSource(idle());
    }
  }

  return {
    setActive(on) {
      if (on) connect().catch((e) => console.warn("SO-101 live unavailable:", e));
      else disconnect();
    },
    dispose() {
      disposed = true;
      disconnect();
    }
  };
}
