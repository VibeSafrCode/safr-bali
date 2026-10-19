"""Read-only production launch check; invoke from the verified service contract.

No listeners, database access, network calls, user mutation or secret output.
This does not infer production from a host or silently change local/preview.
"""

import os
import sys


def main() -> int:
    # Require an explicitly exported launch profile before importing settings.
    # A missing ENVIRONMENT must not be rescued by local defaults or a .env.
    raw = os.environ.get("ENVIRONMENT", "")
    if raw.strip().lower() not in {"prod", "production"}:
        print("Production preflight refused: explicit production profile required.", file=sys.stderr)
        return 2
    try:
        from app.core.config import settings

        if settings.ENVIRONMENT != "production":
            raise RuntimeError("Production profile required")
        settings.validate_production_security()
    except Exception:
        # Validation/driver values can contain credentials. Do not print repr,
        # exception text, environment contents or a traceback from this CLI.
        print("Production preflight refused: unsafe runtime configuration.", file=sys.stderr)
        return 2
    print("SAFR backend production preflight: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
