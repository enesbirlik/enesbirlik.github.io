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
