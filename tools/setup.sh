#!/bin/bash
# One-time setup for the SEO Vault pipeline.
# Uses Homebrew's Python 3.10 in its own virtual environment here in tools/.venv, isolated
# from your system Python: PyTorch (which Whisper needs) has no wheel for newer Python on
# an Intel Mac, so 3.10 is what actually installs cleanly on this machine.
set -e
cd "$(dirname "$0")"

PY310="$(command -v python3.10 || echo /usr/local/bin/python3.10)"
if [ ! -x "$PY310" ]; then
  echo "Python 3.10 not found. Install it with: brew install python@3.10"
  exit 1
fi

"$PY310" -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt

echo "Done. ffmpeg must also be on your PATH (brew install ffmpeg)."
echo "Run the pipeline with: tools/.venv/bin/python tools/seo_vault_pipeline.py <folder_of_videos>"
