/* Joint-angle sources for the SO-101 viewer.

   A source is a plain object:
     id      short name: "idle" (now), later "replay" / "live"
     label   text for the corner status tag (e.g. "● LIVE", "REPLAY"), or null to hide it
     start() called once before the first read(); may return a Promise
             (fetch a recording, open a socket). A rejection makes the viewer fall back to idle.
     stop()  release timers / connections
     read(t) joint angles in radians at time t (seconds since start), keyed by URDF joint name.
             Joints left out keep their last value; return null to hold the whole pose.

   Planned sources, same shape:
     replay  start(): fetch data/replays/<name>.json  ({ joints: [...], frames: [[t, a1, a2, ...], ...] })
             read(t): interpolate the frame at t % duration
     live    start(): MQTT-over-WebSocket subscription (read-only); keep the latest message
             read():  return it (or null until the first message arrives) */

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
