import subprocess
import os
import time

DEMO = r"D:\1\demo"
LT_CMD = r"C:\Users\rongfei\AppData\Roaming\npm\lt.cmd"

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
FLAGS = CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

tunnel_log = open(os.path.join(DEMO, "tunnel.log"), "w")
proc = subprocess.Popen(
    [LT_CMD, "--port", "8090"],
    cwd=DEMO, creationflags=FLAGS,
    stdout=tunnel_log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
print(f"Tunnel PID: {proc.pid}")
time.sleep(10)

with open(os.path.join(DEMO, "tunnel.log"), "r") as f:
    print("tunnel:", f.read())