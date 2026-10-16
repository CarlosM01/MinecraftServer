"""
Shared helpers for restore_script.py and test_backup.py.

Two backup layouts are supported:
  * world-only (legacy):  <top>/level.dat, <top>/region/…   → restored into <data>/<level>
  * full data folder:      <top>/server.properties, <top>/world/…, <top>/mods/… → restored into <data>
"""

import os
import shutil
import tarfile
import tempfile


def _safe_extract(tar, path):
    # Python 3.12+ rejects absolute paths, links outside the tree, devices…
    try:
        tar.extractall(path=path, filter="data")
    except TypeError:
        for member in tar.getmembers():
            target = os.path.realpath(os.path.join(path, member.name))
            if not target.startswith(os.path.realpath(path) + os.sep):
                raise RuntimeError(f"Unsafe path in archive: {member.name}")
        tar.extractall(path=path)


def _copy_contents(src, dest):
    os.makedirs(dest, exist_ok=True)
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dest, item)
        if os.path.isdir(s) and not os.path.islink(s):
            shutil.copytree(s, d, dirs_exist_ok=True, symlinks=True)
        else:
            shutil.copy2(s, d)


def _clean(dest, preserve):
    if not os.path.isdir(dest):
        return
    for item in os.listdir(dest):
        if item in preserve or (item.endswith(".jar") and "*.jar" in preserve):
            continue
        path = os.path.join(dest, item)
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        else:
            os.remove(path)


def extract_backup(backup_file, data_dir, level="world", clean=False, preserve=(), work_dir=None):
    """
    Extract `backup_file` into the server data folder `data_dir`.
    Returns "world" or "full" depending on the detected layout.
    """
    work_dir = work_dir or os.path.dirname(os.path.abspath(data_dir))
    os.makedirs(work_dir, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix=".restore-", dir=work_dir)
    try:
        with tarfile.open(backup_file, "r:*") as tar:
            _safe_extract(tar, temp_dir)

        entries = [e for e in os.listdir(temp_dir) if not e.startswith(".")] or os.listdir(temp_dir)
        top = os.path.join(temp_dir, entries[0]) if len(entries) == 1 and os.path.isdir(os.path.join(temp_dir, entries[0])) else temp_dir

        if os.path.exists(os.path.join(top, "level.dat")):
            world_dir = os.path.join(data_dir, level)
            print(f"World-only backup detected; restoring into {world_dir}", flush=True)
            if clean and os.path.isdir(world_dir):
                shutil.rmtree(world_dir)
            _copy_contents(top, world_dir)
            return "world"

        print(f"Full data backup detected; restoring into {data_dir}", flush=True)
        if clean:
            _clean(data_dir, set(preserve))
        _copy_contents(top, data_dir)
        return "full"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
