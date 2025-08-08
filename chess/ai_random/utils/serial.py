import sys
import json
import time


def write(data: dict):
  json_string = json.dumps(data)
  sys.stdout.write(json_string + '\n')
  sys.stdout.flush()


def read() -> dict:
  line = sys.stdin.readline()
  return json.loads(line)
