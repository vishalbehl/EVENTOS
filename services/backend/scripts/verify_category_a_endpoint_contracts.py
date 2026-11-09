"""Installed-route coverage gate. Run only during authorised verification.

This imports application construction, not lifespan/startup. It intentionally
fails until every API route has an explicit audience/access/resource contract.
It does not verify the implementations of their permission/ownership resolvers.
"""
import sys
import json
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    from scripts.verify_catalogue_reference_writers import scan as scan_catalogue_writers
    from app.config import settings
    from app.core.endpoint_contracts import require_complete_api_contracts
    from app.main import fastapi_app
    require_complete_api_contracts(fastapi_app, settings.api_v1_prefix)
    writer_report = scan_catalogue_writers()
    if writer_report["status"] != "PASSED":
        raise RuntimeError(
            "Catalogue reference-writer inventory drifted:\n"
            + json.dumps(writer_report, indent=2, sort_keys=True)
        )


if __name__ == "__main__":
    main()
