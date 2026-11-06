# enesbirlik.github.io

Personal portfolio, served by GitHub Pages straight from `main` (static HTML/CSS/JS, no build step).

## "Now Building" card (SO-101)

### Roadmap

Steps live in [`data/roadmap.json`](data/roadmap.json):

```json
{ "updated": "2026-10-23",
  "steps": [ { "id": "assembly", "title": { "tr": "…", "en": "…" }, "status": "done | active | todo", "date": "optional" } ] }
```

The page fetches this file (`ROADMAP_URL` in `assets/js/main.js`) and falls back to the copy embedded in
`index.html` (`<script id="roadmap-fallback">`). The progress bar counts `done` as 1 and `active` as 0.5.

To update: edit the JSON, bump `updated`, commit. The pre-commit hook validates it and refreshes the embedded copy.
Enable the hook once per clone:

```sh
git config core.hooksPath .githooks
python3 scripts/sync_roadmap.py          # what the hook runs; --check only reports
```

### 3D view

`assets/js/so101/` draws the real SO-101 URDF with three.js + [urdf-loader](https://github.com/gkjohnson/urdf-loaders)
(loaded from jsDelivr via the import map in `index.html`), only once the card scrolls into view. Without WebGL,
with `prefers-reduced-motion`, or if anything fails to load, the SVG schematic stays.

- `viewer.js` – entry point: capability checks, lazy loading, pause when off-screen, fallback.
- `scene.js` – rendering (hidden-line edges, joint rings, hover readout, orbit controls).
- `sources.js` – where joint angles come from. Only the `idle` source exists; the file documents the
  interface for the planned `replay` and `live` (MQTT over WebSocket) sources. The corner status tag
  (`#viz-status`) shows the active source's `label`.

Replay recordings should go in `data/replays/` (format sketched in `sources.js`).

### Live robot

While I work with the robot, the 3D view can show the real arm. Nothing is sent otherwise.

```sh
scripts/so101_live.sh      # Ctrl+C stops; needs the robot's ROS 2 stack (/joint_states)
```

One-time setup, no sudo:

```sh
python3 -m venv --system-site-packages ~/.venvs/so101-live
~/.venvs/so101-live/bin/pip install paho-mqtt
```

**Path of the data:** `scripts/so101_live_bridge.py` reads `/joint_states` and publishes `{"t", "q": {joint: rad}}` at 10 Hz to the public HiveMQ broker (`broker.hivemq.com`), topic `enesbirlik/so101/live/v1/joints`.

- `…/status` is retained: `online`, or `offline`, which is also the last will.
- While the card is on screen, `watchLive()` in `sources.js` subscribes read-only over `wss://broker.hivemq.com:8884/mqtt` (mqtt.js from jsDelivr).
- When messages arrive, the view switches to the eased live source and shows "● LIVE". After 3 s without one, it goes back to the idle sway.

**The broker is public.** Anyone can read these topics, and anyone can write to them. The page therefore accepts only the known joint names with finite values under 3.2 rad.

**Tested on 2026-11-06** with a fake `/joint_states`:
- 10 msg/s arrived over WSS, about 50 ms after they were sent.
- Headless Chrome showed "● LIVE" on the local site, and went back to idle 3 s after the bridge stopped.

### Regenerating the model

The URDF and meshes in `assets/so101/` come from
[TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) (Apache-2.0, see `assets/so101/LICENSE`
and `NOTICE.md`). To rebuild them (e.g. after bumping `COMMIT` in the script):

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/convert_so101.py        # downloads the pinned commit, writes assets/so101/
```

`--src DIR` uses a local `Simulation/SO101` folder instead of downloading, `--reduction 0.5` decimates the meshes,
`--no-draco` writes plain GLB. After changing anything under `assets/js/so101/`, bump `VERSION` in `viewer.js`
and the `?v=` on its `<script>` tag so browsers pick up the new files.
