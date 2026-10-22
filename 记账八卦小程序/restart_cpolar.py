import subprocess
import os
import time

CPOLAR = r"D:\cploar\cpolar.exe"

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
FLAGS = CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

log = open(r"D:\1\demo\cpolar_restart.log", "w")

proc = subprocess.Popen(
    [CPOLAR, "service", "restart"],
    creationflags=FLAGS,
    stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
proc.wait(timeout=20)
print(f"restart exit: {proc.returncode}")

time.sleep(5)

with open(r"D:\1\demo\cpolar_restart.log", "r") as f:
    print("LOG:", f.read())