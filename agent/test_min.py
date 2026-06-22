import sys, os, threading, time
from pathlib import Path
log_path = Path(sys.executable).parent / "test_output.txt"
log_path.write_text(f"Python {sys.version}\nfrozen={getattr(sys,'frozen',False)}\nexe={sys.executable}\n")

import fastapi, uvicorn
from fastapi import FastAPI
app2 = FastAPI()

@app2.get("/test")
def t(): return {"ok": True}

def srv():
    try:
        uvicorn.run(app2, host="127.0.0.1", port=8766, log_level="warning")
    except Exception as e:
        log_path.open("a").write(f"UVICORN ERROR: {e}\n")

th = threading.Thread(target=srv, daemon=True)
th.start()
time.sleep(10)
log_path.open("a").write("FIM\n")
