# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for RedNotebook AI desktop binaries.

Run from the repository root with the Next.js export already built at
``frontend/out``:

    pyinstaller packaging/rednotebook.spec --noconfirm
"""

import sys as _sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

repo_root = Path(SPECPATH).resolve().parent
static_frontend = repo_root / "frontend" / "out"
logo_png = repo_root / "frontend" / "public" / "logo.png"

# PyInstaller expects .icns on macOS and .ico on Windows. We don't ship those
# yet, so only set an icon when the right file is present.
icon_icns = repo_root / "packaging" / "icon.icns"
icon_ico = repo_root / "packaging" / "icon.ico"
if _sys.platform == "darwin" and icon_icns.exists():
    icon_path = str(icon_icns)
elif _sys.platform.startswith("win") and icon_ico.exists():
    icon_path = str(icon_ico)
else:
    icon_path = None

# Bundle the entire app package and every router so dynamic imports survive
# the freeze.
hidden = (
    collect_submodules("rednotebook")
    + collect_submodules("uvicorn")
    + ["email_validator", "jwt", "bcrypt"]
)
datas = []
if static_frontend.is_dir():
    datas.append((str(static_frontend), "static_frontend"))
if logo_png.exists():
    datas.append((str(logo_png), "."))

block_cipher = None

a = Analysis(
    [str(repo_root / "rednotebook" / "desktop.py")],
    pathex=[str(repo_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# One-folder build keeps startup fast; the GitHub workflow zips this up
# (or wraps it in a DMG / Inno Setup installer) for release artifacts.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="RedNotebook AI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=icon_path,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="RedNotebook AI",
)

# macOS .app bundle
app = BUNDLE(
    coll,
    name="RedNotebook AI.app",
    icon=icon_path,
    bundle_identifier="in.redanalytica.rednotebookai",
    info_plist={
        "CFBundleName": "RedNotebook AI",
        "CFBundleDisplayName": "RedNotebook AI",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion": "0.1.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "11.0",
    },
)
