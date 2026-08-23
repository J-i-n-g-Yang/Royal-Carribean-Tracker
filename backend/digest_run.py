"""
Entry point for the weekly digest GitHub Action (see
.github/workflows/weekly-digest.yml). Unlike scheduled_run.py, this makes no
Royal Caribbean/Celebrity API calls and needs no account credentials — it
only reads backend/data/history.json (restored via actions/cache, same as
the daily check) and sends a summary through digest.py.

Because no login happens here, there's no username/password to mask and no
verbose engine console output to suppress — this file is intentionally much
shorter than scheduled_run.py.
"""
import os
import sys

import digest


def main() -> int:
    days = int(os.environ.get("DIGEST_DAYS", digest.DEFAULT_DIGEST_DAYS))

    result = digest.send_digest(days=days)

    built = result.get("digest", {})
    print(
        f"digest days={days} run_count={built.get('run_count', 0)} "
        f"hit_count={built.get('hit_count', 0)} sent={result.get('success')}"
    )

    if not result.get("success"):
        print(f"Digest not sent: {result.get('error')}", file=sys.stderr)
        # A digest with nothing to report and no notify URLs configured yet
        # shouldn't fail the whole workflow run (red X in Actions) the same
        # way a real check failure should — so treat "no URLs configured" as
        # informational rather than an exit-1 failure.
        if "No notification URLs configured" in (result.get("error") or ""):
            return 0
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
