"""Offline preflight. Does not import runtime, read env or contact Telegram."""
import argparse
import json
from pathlib import Path

from .catalog import load_catalog
from .config import RuntimeConfigError, site_origin


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shared-root", type=Path, required=True)
    parser.add_argument("--site-origin", required=True)
    args = parser.parse_args()
    try:
        site_origin(args.site_origin)
        services = load_catalog(args.shared_root)
    except RuntimeConfigError as error:
        print(json.dumps({"status": "FAIL", "code": str(error)}))
        return 2
    print(json.dumps({"status": "PASS", "locales": ["ru", "en"], "serviceLinks": len(services),
                      "contentIds": [s.content_id for s in services], "telegramRequests": 0}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
