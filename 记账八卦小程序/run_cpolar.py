import subprocess
import os

DEMO = r"D:\1\demo"
CPOLAR = r"D:\cploar\cpolar.exe"

CREATE_BREAKAWAY_FROM_JOB = 0x01000000
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
FLAGS = CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

log_path = os.path.join(DEMO, "cpolar.log")
log = open(log_path, "w")

proc = subprocess.Popen(
    [CPOLAR, "version"],
    creationflags=FLAGS,
    stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
)
proc.wait(timeout=15)

with open(log_path, "r") as f:
    print("EXIT:", proc.returncode)
    print("LOG:", f.read())