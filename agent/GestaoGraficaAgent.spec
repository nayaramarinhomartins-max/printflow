# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

pystray_datas, pystray_binaries, pystray_hiddenimports = collect_all('pystray')
pil_datas, pil_binaries, pil_hiddenimports = collect_all('PIL')

import os, sys
pywin32_sys32 = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming',
    'Python', f'Python{sys.version_info.major}{sys.version_info.minor}',
    'site-packages', 'pywin32_system32')
pywin32_binaries = []
if os.path.isdir(pywin32_sys32):
    for dll in os.listdir(pywin32_sys32):
        if dll.endswith('.dll'):
            pywin32_binaries.append((os.path.join(pywin32_sys32, dll), '.'))

a = Analysis(
    ['printflow_agent.py'],
    pathex=[],
    binaries=pystray_binaries + pil_binaries + pywin32_binaries,
    datas=pystray_datas + pil_datas,
    hiddenimports=(
        pystray_hiddenimports + pil_hiddenimports + [
            'win32print', 'win32api', 'win32con', 'pywintypes', 'win32gui',
            'wmi', 'pystray._win32', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont',
            'fastapi', 'uvicorn', 'uvicorn.lifespan.on', 'uvicorn.logging',
            'uvicorn.loops', 'uvicorn.loops.auto',
            'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
            'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='GestaoGraficaAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
