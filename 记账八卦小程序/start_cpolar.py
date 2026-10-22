import subprocess
import os
import time

DEMO = r"D:\1\demo"
CPOLAR = r"D:\cploar\cpolar.exe"

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
FLAGS = CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

log_path = os.path.join(DEMO, "cpolar_tunnel.log")
log = open(log_path, "w")

proc = subprocess.Popen(
    [CPOLAR, "http", "8090"],
    creationflags=FLAGS,
    stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
print(f"cpolar PID: {proc.pid}")

time.sleep(12)

with open(log_path, "r") as f:
    content = f.read()
print("=== cpolar output ===")
print(content)