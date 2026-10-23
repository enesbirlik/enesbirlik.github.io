#!/usr/bin/env python3
"""Build the web copy of the SO-101 follower model in assets/so101/.

Downloads so101_new_calib.urdf and its STL meshes from TheRobotStudio/SO-ARM100
(Apache-2.0, pinned commit below), decimates the meshes, writes them as
Draco-compressed GLB files and a trimmed URDF (visuals only) that points at them.

    python3 -m venv .venv
    .venv/bin/pip install -r scripts/requirements.txt
    .venv/bin/python scripts/convert_so101.py                # download + convert
    .venv/bin/python scripts/convert_so101.py --src DIR      # use a local Simulation/SO101 copy
    .venv/bin/python scripts/convert_so101.py --reduction 0.5 --no-draco
"""
import argparse
import json
import pathlib
import shutil
import struct
import tempfile
import urllib.request
import xml.etree.ElementTree as ET

import DracoPy
import fast_simplification
import numpy as np
import trimesh

REPO = "TheRobotStudio/SO-ARM100"
COMMIT = "a758567c3978dfeefe282ede0500085a48fe8f78"
URDF_NAME = "so101_new_calib.urdf"
RAW = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}"

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "so101"
# Only what the viewer needs; everything else (inertials, collisions, ros2_control) is dropped.
DROP_TAGS = {"collision", "inertial", "transmission", "ros2_control", "gazebo", "material"}


def download(src_dir):
    (src_dir / "assets").mkdir(parents=True, exist_ok=True)
    fetch = lambda rel, dest: urllib.request.urlretrieve(f"{RAW}/{rel}", src_dir / dest)
    fetch(f"Simulation/SO101/{URDF_NAME}", URDF_NAME)
    fetch("LICENSE", "LICENSE")
    for mesh in mesh_paths(ET.parse(src_dir / URDF_NAME)):
        print("  fetch", mesh)
        fetch(f"Simulation/SO101/{mesh}", mesh)


def mesh_paths(tree):
    return sorted({m.get("filename") for m in tree.iter("mesh")})


def write_glb(path, vertices, faces, draco):
    vertices = np.ascontiguousarray(vertices, dtype=np.float32)
    faces = np.ascontiguousarray(faces, dtype=np.uint32)
    if draco:
        blob = DracoPy.encode(vertices, faces, quantization_bits=14, compression_level=10)
        decoded = DracoPy.decode(blob)  # accessor counts/bounds must describe the decoded mesh
        points = np.asarray(decoded.points, dtype=np.float32)
        n_vertices, n_indices = len(points), np.asarray(decoded.faces).size
        views = [{"buffer": 0, "byteOffset": 0, "byteLength": len(blob)}]
        bounds = points
        primitive = {
            "attributes": {"POSITION": 0}, "indices": 1, "mode": 4,
            "extensions": {"KHR_draco_mesh_compression": {"bufferView": 0, "attributes": {"POSITION": 0}}},
        }
        pos_accessor, idx_accessor = {}, {}
    else:
        pos, idx = vertices.tobytes(), faces.tobytes()
        blob = pos + idx
        n_vertices, n_indices = len(vertices), faces.size
        views = [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(idx), "target": 34963},
        ]
        bounds = vertices
        primitive = {"attributes": {"POSITION": 0}, "indices": 1, "mode": 4}
        pos_accessor, idx_accessor = {"bufferView": 0}, {"bufferView": 1}

    gltf = {
        "asset": {"version": "2.0", "generator": "convert_so101.py"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [primitive]}],
        "accessors": [
            {**pos_accessor, "componentType": 5126, "count": n_vertices, "type": "VEC3",
             "min": bounds.min(0).tolist(), "max": bounds.max(0).tolist()},
            {**idx_accessor, "componentType": 5125, "count": n_indices, "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    if draco:
        gltf["extensionsUsed"] = gltf["extensionsRequired"] = ["KHR_draco_mesh_compression"]

    pad = lambda b, fill: b + fill * (-len(b) % 4)
    js = pad(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    bin_ = pad(blob, b"\0")
    length = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, length))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def convert(src_dir, reduction, draco):
    tree = ET.parse(src_dir / URDF_NAME)
    meshes_out = OUT / "meshes"
    shutil.rmtree(meshes_out, ignore_errors=True)
    meshes_out.mkdir(parents=True)

    total_in = total_out = 0
    for rel in mesh_paths(tree):
        mesh = trimesh.load(src_dir / rel, force="mesh")
        mesh.merge_vertices()
        v, f = mesh.vertices, mesh.faces
        if reduction > 0:
            v, f = fast_simplification.simplify(v, f, target_reduction=reduction)
        out = meshes_out / (pathlib.Path(rel).stem + ".glb")
        write_glb(out, v, f, draco)
        total_in += len(mesh.faces)
        total_out += len(f)
        print(f"  {out.name:40s} {len(mesh.faces):6d} -> {len(f):5d} tris  {out.stat().st_size / 1024:6.1f} KB")

    for parent in tree.iter():
        for child in [c for c in parent if c.tag in DROP_TAGS]:
            parent.remove(child)
    for mesh in tree.iter("mesh"):
        mesh.set("filename", "meshes/" + pathlib.Path(mesh.get("filename")).stem + ".glb")
    ET.indent(tree)
    tree.write(OUT / "so101.urdf", encoding="unicode", xml_declaration=False)
    shutil.copy(src_dir / "LICENSE", OUT / "LICENSE")
    (OUT / "NOTICE.md").write_text(
        f"SO-101 follower model from https://github.com/{REPO} (commit {COMMIT[:7]}),\n"
        f"`Simulation/SO101/{URDF_NAME}`, licensed under Apache-2.0 (see LICENSE).\n\n"
        "Modified for the web by scripts/convert_so101.py: STL meshes "
        + (f"decimated (target reduction {reduction}) and " if reduction > 0 else "")
        + f"converted to GLB{' with Draco compression' if draco else ''};\n"
        "the URDF was reduced to links, joints and visuals, with mesh paths pointing at the GLB files.\n",
        encoding="utf-8",
    )
    size = sum(p.stat().st_size for p in meshes_out.iterdir())
    print(f"total {total_in} -> {total_out} tris, meshes {size / 1024:.0f} KB -> {OUT.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=pathlib.Path, help="local Simulation/SO101 dir (with LICENSE copied in)")
    # Draco alone gets the full-detail meshes to ~300 KB; decimating makes the edge drawing noisy.
    ap.add_argument("--reduction", type=float, default=0.0, help="fraction of triangles to remove (0 = keep all)")
    ap.add_argument("--no-draco", action="store_true", help="write plain GLB without Draco")
    args = ap.parse_args()

    if args.src:
        convert(args.src, args.reduction, not args.no_draco)
        return
    with tempfile.TemporaryDirectory() as tmp:
        print(f"downloading {REPO}@{COMMIT[:7]}")
        download(pathlib.Path(tmp))
        convert(pathlib.Path(tmp), args.reduction, not args.no_draco)


if __name__ == "__main__":
    main()
