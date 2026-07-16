#!/usr/bin/env python3
"""Time helpers for the update-tempo-alerts skill.

IST is a fixed UTC+5:30 offset (no DST). Slack `ts` values are epoch seconds (UTC).

Usage:
  python3 times.py                # print NOW + this week's Monday (IST) as epoch/date
  python3 times.py utc <epoch>    # convert epoch -> 'YYYY-MM-DD HH:MM:SS UTC'
  python3 times.py ist <epoch>    # convert epoch -> 'YYYY-MM-DD HH:MM:SS IST'
"""
import sys
from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))


def _fmt(dt, label):
    return dt.strftime("%Y-%m-%d %H:%M:%S ") + label


def main():
    args = sys.argv[1:]

    if not args:
        now = datetime.now(timezone.utc)
        now_ist = now.astimezone(IST)
        # Monday of the current week, at 00:00 IST (weekday(): Mon=0).
        monday_ist = (now_ist - timedelta(days=now_ist.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        print(f"NOW_EPOCH={int(now.timestamp())}")
        print(f"NOW_UTC={_fmt(now, 'UTC')}")
        print(f"NOW_IST={_fmt(now_ist, 'IST')}")
        print(f"WEEK_MONDAY_IST_DATE={monday_ist.strftime('%Y-%m-%d')}")
        print(f"WEEK_MONDAY_EPOCH={int(monday_ist.timestamp())}")
        return

    if len(args) == 2 and args[0] in ("utc", "ist"):
        epoch = float(args[1])
        dt = datetime.fromtimestamp(epoch, timezone.utc)
        if args[0] == "ist":
            print(_fmt(dt.astimezone(IST), "IST"))
        else:
            print(_fmt(dt, "UTC"))
        return

    print(__doc__)
    sys.exit(1)


if __name__ == "__main__":
    main()
