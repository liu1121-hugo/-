import subprocess
import sys
import os
import time
import urllib.request

DEMO = r"D:\1\demo"
PYTHON = sys.executable
PORT = "8090"

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
FLAGS = CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

server_log = open(os.path.join(DEMO, "server.log"), "w")
proc1 = subprocess.Popen(
    [PYTHON, "-m", "http.server", PORT, "--directory", DEMO],
    creationflags=FLAGS,
    stdout=server_log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
print(f"Server PID: {proc1.pid}")
time.sleep(3)

try:
    r = urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=3)
    print(f"server_status: {r.status}")
except Exception as e:
    print(f"server_fail: {e}")

tunnel_log = open(os.path.join(DEMO, "tunnel.log"), "w")
proc2 = subprocess.Popen(
    ["lt", "--port", PORT],
    cwd=DEMO, creationflags=FLAGS,
    stdout=tunnel_log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
print(f"Tunnel PID: {proc2.pid}")
time.sleep(8)

with open(os.path.join(DEMO, "tunnel.log"), "r") as f:
    print("tunnel:", f.read())