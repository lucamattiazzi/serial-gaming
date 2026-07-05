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


def parse_payload(raw_payload: str) -> list:
    try:
        payload = json.loads(raw_payload)
        board = payload.get("board")
        if not isinstance(board, list) or len(board) != 9:
            raise ValueError("Invalid board format")
        return board
    except Exception as e:
        raise ValueError(f"Unexpected error: {e}")
