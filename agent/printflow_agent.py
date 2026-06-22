"""
Gestão Gráfica Agent — Servidor local de impressão
Roda em segundo plano com ícone na bandeja do sistema (system tray).
Porta padrão: http://localhost:8765
"""

from __future__ import annotations

import os
import sys
import json
import re
import tempfile
import subprocess
import threading
import logging
from pathlib import Path
from typing import Optional

# ── Dependências externas ─────────────────────────────────────────────────────
try:
    import win32print
    import win32api
    import win32con
    import pywintypes
except ImportError:
    sys.exit("Instale: pip install pywin32")

try:
    import wmi as _wmi
    WMI_OK = True
except ImportError:
    WMI_OK = False

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    sys.exit("Instale: pip install fastapi uvicorn[standard]")

try:
    import pystray
    from PIL import Image, ImageDraw, ImageFont
    TRAY_OK = True
except ImportError:
    TRAY_OK = False

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
LOG_FILE = BASE_DIR / "agent.log"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
log = logging.getLogger("gestaografica-agent")

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(title="Gestão Gráfica Agent", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# Helpers — Impressoras
# =============================================================================

STATUS_BITS: dict[int, str] = {
    win32print.PRINTER_STATUS_PAUSED:            "Pausada",
    win32print.PRINTER_STATUS_ERROR:             "Erro",
    win32print.PRINTER_STATUS_PAPER_JAM:         "Atolamento de papel",
    win32print.PRINTER_STATUS_PAPER_OUT:         "Sem papel",
    win32print.PRINTER_STATUS_OFFLINE:           "Offline",
    win32print.PRINTER_STATUS_PRINTING:          "Imprimindo",
    win32print.PRINTER_STATUS_TONER_LOW:         "Toner baixo",
    win32print.PRINTER_STATUS_NO_TONER:          "Sem toner",
    win32print.PRINTER_STATUS_USER_INTERVENTION: "Requer atenção",
    win32print.PRINTER_STATUS_DOOR_OPEN:         "Tampa aberta",
    win32print.PRINTER_STATUS_POWER_SAVE:        "Modo economia",
}


def decode_status(status_int: int) -> list[str]:
    if status_int == 0:
        return ["Pronta"]
    msgs = [msg for bit, msg in STATUS_BITS.items() if status_int & bit]
    return msgs or ["Status desconhecido"]


def listar_impressoras() -> list[dict]:
    result = []
    try:
        printers = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS, None, 2
        )
    except Exception as e:
        log.error("Erro ao listar impressoras: %s", e)
        return []

    default_name = ""
    try:
        default_name = win32print.GetDefaultPrinter()
    except Exception:
        pass

    for p in printers:
        name = p["pPrinterName"]
        status_n = p.get("Status", 0)
        try:
            h = win32print.OpenPrinter(name)
            info = win32print.GetPrinter(h, 2)
            status_n = info.get("Status", status_n)
            win32print.ClosePrinter(h)
        except Exception:
            pass

        status_msgs = decode_status(status_n)
        online = status_n == 0 or status_n not in (
            win32print.PRINTER_STATUS_OFFLINE,
            win32print.PRINTER_STATUS_ERROR,
        )

        result.append({
            "nome":       name,
            "padrao":     name == default_name,
            "online":     online,
            "status":     status_msgs,
            "status_raw": status_n,
            "driver":     p.get("pDriverName", ""),
            "porta":      p.get("pPortName", ""),
        })

    return sorted(result, key=lambda x: (not x["padrao"], x["nome"]))


# =============================================================================
# Helpers — Nível de tinta
# =============================================================================

def _ink_via_wmi(printer_name: str) -> Optional[list[dict]]:
    if not WMI_OK:
        return None
    try:
        c = _wmi.WMI()
        jobs = c.query(
            f"SELECT * FROM Win32_Printer WHERE Name = '{printer_name.replace(chr(39), chr(39)*2)}'"
        )
        if not jobs:
            return None
        printer = jobs[0]
        ext = getattr(printer, "ExtendedPrinterStatus", 0) or 0
        ink_low = ext in (9, 10, 11)
        return [{"cor": "Geral", "nivel": 0 if ink_low else None, "aviso": ink_low}]
    except Exception:
        return None


def obter_tinta(printer_name: str) -> dict:
    porta = ""
    try:
        h = win32print.OpenPrinter(printer_name)
        info = win32print.GetPrinter(h, 2)
        porta = info.get("pPortName", "")
        win32print.ClosePrinter(h)
    except Exception:
        pass

    ink = _ink_via_wmi(printer_name)
    if ink:
        return {"fonte": "wmi", "cartuchos": ink}

    return {
        "fonte": "indisponivel",
        "cartuchos": [],
        "mensagem": (
            "Nível de tinta não disponível para esta impressora. "
            "Verifique pelo software da fabricante."
        ),
    }


# =============================================================================
# Helpers — Impressão de PDF
# =============================================================================

def imprimir_pdf(pdf_bytes: bytes, printer_name: str, copias: int = 1) -> dict:
    tmp = Path(tempfile.mktemp(suffix=".pdf"))
    tmp.write_bytes(pdf_bytes)

    sumatra_paths = [
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "SumatraPDF" / "SumatraPDF.exe"),
    ]
    sumatra = next((p for p in sumatra_paths if Path(p).exists()), None)

    def cleanup():
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

    if sumatra:
        cmd = [sumatra, "-print-to", printer_name, "-print-settings", f"{copias}x", "-silent", str(tmp)]
        try:
            proc = subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW)
            threading.Timer(30, cleanup).start()
            return {"ok": True, "metodo": "sumatrapdf", "pid": proc.pid}
        except Exception as e:
            log.error("SumatraPDF falhou: %s", e)

    try:
        win32api.ShellExecute(0, "print", str(tmp), f'/d:"{printer_name}"', ".", 0)
        threading.Timer(30, cleanup).start()
        return {"ok": True, "metodo": "shellexecute"}
    except Exception as e:
        cleanup()
        return {"ok": False, "erro": str(e)}


# =============================================================================
# Rotas da API
# =============================================================================

@app.get("/ping")
def ping():
    return {"ok": True, "versao": "1.1.0"}


@app.get("/impressoras")
def get_impressoras():
    return {"impressoras": listar_impressoras()}


@app.get("/impressoras/{nome_impressora}/tinta")
def get_tinta(nome_impressora: str):
    return obter_tinta(nome_impressora.replace("%20", " "))


class LimpezaRequest(BaseModel):
    nivel: str = "normal"


@app.post("/impressoras/{nome_impressora}/limpar")
def post_limpar(nome_impressora: str, req: LimpezaRequest):
    nome = nome_impressora.replace("%20", " ")
    if req.nivel not in ("normal", "profundo", "verificar"):
        raise HTTPException(400, "nivel deve ser: normal, profundo ou verificar")
    return {"ok": True, "descricao": f"Limpeza {req.nivel} solicitada para {nome}"}


@app.post("/imprimir")
async def post_imprimir(
    impressora: str,
    copias: int = 1,
    arquivo: UploadFile = File(...),
):
    if not arquivo.filename or not arquivo.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Apenas arquivos PDF são aceitos")
    pdf_bytes = await arquivo.read()
    if len(pdf_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "PDF muito grande (máximo 50 MB)")
    result = imprimir_pdf(pdf_bytes, impressora, copias)
    if not result.get("ok"):
        raise HTTPException(500, result.get("erro", "Erro ao imprimir"))
    return result


@app.get("/impressoras/padrao")
def get_impressora_padrao():
    try:
        return {"nome": win32print.GetDefaultPrinter()}
    except Exception as e:
        raise HTTPException(500, str(e))


# =============================================================================
# System Tray
# =============================================================================

def criar_icone_tray() -> Image.Image:
    """Cria um ícone simples CMYK para o system tray."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fundo arredondado azul escuro
    draw.ellipse([2, 2, size - 2, size - 2], fill=(30, 48, 80, 255))

    # Quatro círculos CMYK sobrepostos (ícone gráfica)
    r = 10
    cx, cy = size // 2, size // 2
    draw.ellipse([cx - r - 8, cy - r - 4, cx + r - 8, cy + r - 4], fill=(0, 188, 212, 200))   # Ciano
    draw.ellipse([cx - r + 2, cy - r - 4, cx + r + 2, cy + r - 4], fill=(233, 30, 99, 200))   # Magenta
    draw.ellipse([cx - r - 3, cy - r + 6, cx + r - 3, cy + r + 6], fill=(255, 235, 59, 200))  # Amarelo
    draw.ellipse([cx - r + 7, cy - r + 6, cx + r + 7, cy + r + 6], fill=(33, 33, 33, 220))    # Preto (K)

    return img


def _fallback_janela(parar_event: threading.Event):
    """Janela mínima tkinter usada quando pystray não está disponível."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.title("Gestão Gráfica Agent")
        root.geometry("320x110")
        root.resizable(False, False)
        root.configure(bg="#1C2B4A")
        tk.Label(root, text="Gestão Gráfica Agent", bg="#1C2B4A", fg="white",
                 font=("Arial", 12, "bold")).pack(pady=(18, 4))
        tk.Label(root, text="Rodando em http://localhost:8765", bg="#1C2B4A",
                 fg="#60A5FA", font=("Arial", 9)).pack()
        def parar():
            parar_event.set()
            root.destroy()
            os._exit(0)
        tk.Button(root, text="Parar agente", command=parar, bg="#EF4444",
                  fg="white", relief="flat", padx=12, pady=4).pack(pady=14)
        root.protocol("WM_DELETE_WINDOW", parar)
        def abrir_log():
            subprocess.Popen(["notepad.exe", str(LOG_FILE)],
                             creationflags=subprocess.CREATE_NO_WINDOW)
        root.bind("<Double-Button-1>", lambda e: abrir_log())
        root.mainloop()
    except Exception as e:
        log.error("Fallback tkinter falhou: %s", e)
        parar_event.wait()


def iniciar_tray(parar_event: threading.Event):
    if not TRAY_OK:
        log.warning("pystray não disponível — abrindo janela alternativa")
        _fallback_janela(parar_event)
        return

    icone_img = criar_icone_tray()

    def on_abrir_log(icon, item):
        try:
            subprocess.Popen(["notepad.exe", str(LOG_FILE)], creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def on_parar(icon, item):
        try:
            import ctypes
            resp = ctypes.windll.user32.MessageBoxW(
                0,
                "Deseja parar o Gestão Gráfica Agent?\nO sistema de impressão ficará offline.",
                "Parar agente",
                0x04 | 0x30,  # MB_YESNO | MB_ICONWARNING
            )
            if resp != 6:  # 6 = IDYES
                return
        except Exception:
            pass
        icon.stop()
        parar_event.set()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Gestão Gráfica Agent — Online", lambda: None, enabled=False),
        pystray.MenuItem("localhost:8765", lambda: None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Abrir log", on_abrir_log),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Parar agente", on_parar),
    )

    icon = pystray.Icon(
        name="gestaografica",
        icon=icone_img,
        title="Gestão Gráfica Agent — localhost:8765",
        menu=menu,
    )
    try:
        icon.run()
    except Exception as e:
        log.error("pystray falhou: %s — usando janela alternativa", e)
        _fallback_janela(parar_event)


# =============================================================================
# Ponto de entrada
# =============================================================================

if __name__ == "__main__":
    parar = threading.Event()

    log.info("=" * 60)
    log.info("Gestão Gráfica Agent v1.1.0 iniciando em http://localhost:8765")
    log.info("=" * 60)

    impressoras = listar_impressoras()
    log.info("%d impressora(s) detectada(s):", len(impressoras))
    for p in impressoras:
        log.info("  %s%s — %s", p["nome"], " [PADRÃO]" if p["padrao"] else "", " | ".join(p["status"]))

    # Inicia o servidor HTTP em thread separada
    def run_server():
        try:
            log.info("Servidor HTTP iniciando em 127.0.0.1:8765...")
            # log_config=None evita falha do uvicorn ao configurar formatters em .exe
            uvicorn.run(app, host="127.0.0.1", port=8765, log_config=None)
        except Exception as e:
            log.error("Servidor HTTP falhou: %s", e)

    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    t.join(timeout=3)  # aguarda até 3s para confirmar startup

    # Ícone na bandeja roda na thread principal (obrigatório no Windows)
    iniciar_tray(parar)
