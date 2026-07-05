import sys
import time

import ujson as json


def on_message(fn):
    while True:
        line = sys.stdin.readline()
        if not line:
            time.sleep(0.1)
            continue
        try:
            fn(line)
        except (ValueError, KeyError):
            pass


def send_message(msg: str):
    print(msg)


def parse_payload(raw_payload: str) -> tuple[str, None] | tuple[None, list]:
    try:
        payload = json.loads(raw_payload)
        winner = payload.get("winner")
        board = payload.get("board")
        return winner, board
    except Exception as e:
        raise ValueError(f"Unexpected error: {e}")
