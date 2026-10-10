"""
Second half of the manual SEO Vault flow: takes one finished tip (as JSON, same shape
Gemini would have returned) and pushes it into the CRM, same as the full pipeline would.

Usage: tools/.venv/bin/python tools/push_tip.py <source_video_filename> <json_file>
"""
import json
import sys
from pathlib import Path

from seo_vault_pipeline import append_to_csv, push_to_crm


def main():
    if len(sys.argv) < 3:
        print("Usage: tools/.venv/bin/python tools/push_tip.py <source_video_filename> <json_file>")
        sys.exit(1)

    source_file = sys.argv[1]
    result = json.loads(Path(sys.argv[2]).read_text())

    append_to_csv(result, source_file)
    push_to_crm(result, source_file)
    print(f"Pushed: {result.get('tip', '')[:80]}")


if __name__ == "__main__":
    main()
