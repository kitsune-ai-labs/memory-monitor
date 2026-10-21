"""Stand-in for windows_sampler.ps1 that speaks the same stdin/stdout protocol.

Usage: fake_sampler.py MODE, where MODE is ok, hang, die, huge or stubborn.
"""

import json
import sys
import time

LINE = json.dumps({"v": 1, "fake": True})


def main() -> None:
    mode = sys.argv[1]
    for command in sys.stdin:
        command = command.strip()
        if command == "q" and mode != "stubborn":
            return
        if command != "s":
            continue
        if mode == "hang":
            time.sleep(60)
        if mode == "die":
            sys.exit(3)
        if mode == "huge":
            print("x" * 2_000_000, flush=True)
            continue
        print(LINE, flush=True)


if __name__ == "__main__":
    main()
