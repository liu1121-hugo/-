import subprocess
import sys
import os
import time

DEMO_DIR = r"D:\1\demo"
PORT = "8090"

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000

def start_server():
    subprocess.Popen(
        [sys.executable, "-m", "http.server", PORT],
        cwd=DEMO_DIR,
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
    )
    print(f"HTTP server started on port {PORT}")

def start_tunnel():
    npm_dir = os.path.join(os.environ.get("APPDATA", ""), "npm")
    env = os.environ.copy()
    env["PATH"] = npm_dir + os.pathsep + env.get("PATH", "")
    
    lt_cmd = "lt.cmd" if sys.platform == "win32" else "lt"
    
    log_path = os.path.join(DEMO_DIR, "tunnel.log")
    with open(log_path, "w") as f:
        f.write("")
    
    proc = subprocess.Popen(
        [lt_cmd, "--port", PORT],
        cwd=DEMO_DIR,
        env=env,
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
        stdout=open(log_path, "w"),
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
    )
    print(f"localtunnel started (PID: {proc.pid})")
    return proc

if __name__ == "__main__":
    start_server()
    time.sleep(2)
    start_tunnel()
    time.sleep(6)
    
    log_path = os.path.join(DEMO_DIR, "tunnel.log")
    with open(log_path, "r") as f:
        content = f.read()
    print("=== tunnel.log ===")
    print(content)