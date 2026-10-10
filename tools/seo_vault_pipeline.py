"""
Towpath SEO Vault Pipeline
---------------------------
Processes a folder of downloaded Instagram videos and adds each one as a tip in the
SEO Vault tab of the Towpath CRM:
  1. Extracts audio and transcribes it (Whisper, runs locally)
  2. Pulls a few key frames so on-screen text/captions can be read
  3. Sends transcript + frames + caption to Gemini (free tier) for a structured SEO breakdown
  4. Pushes the result straight into the CRM (Supabase table `seo_vault`)
  5. Also appends it to seo_vault.csv next to this script, as a local backup

SETUP (run once in your terminal):
  ffmpeg must be installed and on your PATH:
    Mac:   brew install ffmpeg
    Win:   choco install ffmpeg   (or download from ffmpeg.org and add to PATH)

  Then, from the towpath-crm folder:  ./tools/setup.sh
  This builds a Python 3.10 virtual environment in tools/.venv and installs everything
  from tools/requirements.txt into it. (Whisper needs PyTorch, which on an Intel Mac has
  no wheel for newer system Pythons, so this keeps a working 3.10 install self-contained
  and off your main Python. On Apple Silicon or Linux you may not need this at all; try
  `pip install -r tools/requirements.txt` with your normal python3 first.)

  Get a free Gemini API key at https://aistudio.google.com/apikey (no credit card needed),
  then set it as an environment variable:
    Mac/Linux:  export GEMINI_API_KEY="..."
    Windows:    setx GEMINI_API_KEY "..."

  The first run also asks for your Towpath CRM email and password (same login as the
  app), then caches a session token in tools/.session.json (gitignored) so later runs
  don't ask again. Set TOWPATH_CRM_EMAIL / TOWPATH_CRM_PASSWORD as env vars instead if
  you'd rather not be prompted.

USAGE:
  1. Drop your downloaded .mp4 files into a folder, e.g. ./videos
  2. Optionally create a captions.json file in that folder mapping filename -> caption
     text (not required, but improves results if the creator wrote a good caption)
  3. Run:  tools/.venv/bin/python tools/seo_vault_pipeline.py ./videos
  4. Open the SEO Vault tab in the CRM to see the new tips
"""

import os
import sys
import csv
import json
import time
import base64
import getpass
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

import whisper
import cv2
import requests

# ---------- CONFIG ----------
WHISPER_MODEL_SIZE = "base"     # tiny/base/small/medium/large — base is a good speed/accuracy tradeoff
FRAMES_PER_VIDEO = 4            # how many key frames to pull for on-screen text
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_CSV = SCRIPT_DIR / "seo_vault.csv"
CAPTIONS_FILE = "captions.json" # optional, lives in the video folder: {"filename.mp4": "caption text"}

# Free tier. Matches the provider picked in the CRM's Settings > Your engines; change both
# together if you switch providers there.
GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Public connection details for the towpath-crm Supabase project (same values as js/config.js).
# This key alone can't read or write anything; every request below signs in as the CRM owner first.
SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
SUPABASE_KEY = "YOUR-PUBLISHABLE-KEY"
SESSION_FILE = SCRIPT_DIR / ".session.json"

SYSTEM_PROMPT = """You are an SEO research analyst for Towpath Creative, a boutique agency
serving local businesses in Frenchtown NJ, Flemington NJ, Doylestown PA, and the Delaware
Valley. Clients are mostly local trades and service businesses with weak or no websites.

You will be given a video transcript, optional on-screen frame text, and an optional caption
from an Instagram SEO tip video. Return ONLY a JSON object with these exact keys:

{
  "tip": "one-line summary of the core tip",
  "creator": "creator name/handle if mentioned, else 'Unknown'",
  "category": "one of: Local SEO, Google Business Profile, On-page, Technical, Content, AI Search, Links, Social",
  "accuracy": "one of: Current & supported, Outdated, Myth, Unverified",
  "accuracy_reason": "one short sentence why",
  "towpath_service": "which Towpath service or client type this applies to",
  "implementation_steps": "3 to 5 concrete steps, separated by ' | '",
  "effort": "Low, Medium, or High",
  "impact": "Low, Medium, or High",
  "routing": "one of: Client deliverable, Internal workflow, Sales pitch talking point, Skip"
}

Plain English. No em dashes. No filler. Return valid JSON only, no other text.
"""


def extract_audio(video_path: Path, out_wav: Path):
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path), "-ar", "16000", "-ac", "1", str(out_wav)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def transcribe(model, wav_path: Path) -> str:
    result = model.transcribe(str(wav_path))
    return result["text"].strip()


def extract_frames(video_path: Path, out_dir: Path, n_frames: int):
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return []

    frame_paths = []
    step = max(total // (n_frames + 1), 1)
    for i in range(1, n_frames + 1):
        frame_idx = min(i * step, total - 1)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if ok:
            out_path = out_dir / f"frame_{i}.jpg"
            cv2.imwrite(str(out_path), frame)
            frame_paths.append(out_path)
    cap.release()
    return frame_paths


def frame_to_base64(path: Path) -> str:
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


def summarize_with_gemini(api_key: str, transcript: str, caption: str, frame_paths: list[Path]) -> dict:
    parts = [{"text": f"Caption: {caption or 'None provided'}\n\nTranscript:\n{transcript or 'No speech detected'}"}]
    for fp in frame_paths:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": frame_to_base64(fp)}})

    r = requests.post(
        f"{GEMINI_URL}?key={api_key}",
        json={
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"maxOutputTokens": 1000, "responseMimeType": "application/json"},
        },
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"Gemini request failed ({r.status_code}): {r.text[:300]}")
    j = r.json()
    try:
        text = j["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {j}") from e
    return json.loads(text)


def load_captions(folder: Path) -> dict:
    captions_path = folder / CAPTIONS_FILE
    if captions_path.exists():
        with open(captions_path) as f:
            return json.load(f)
    return {}


def append_to_csv(row: dict, source_file: str):
    file_exists = OUTPUT_CSV.exists()
    fieldnames = [
        "Tip", "Creator", "Category", "Accuracy", "Accuracy Reason",
        "Towpath Service", "Implementation Steps", "Effort", "Impact",
        "Routing", "Source File",
    ]
    with open(OUTPUT_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow({
            "Tip": row.get("tip", ""),
            "Creator": row.get("creator", ""),
            "Category": row.get("category", ""),
            "Accuracy": row.get("accuracy", ""),
            "Accuracy Reason": row.get("accuracy_reason", ""),
            "Towpath Service": row.get("towpath_service", ""),
            "Implementation Steps": row.get("implementation_steps", ""),
            "Effort": row.get("effort", ""),
            "Impact": row.get("impact", ""),
            "Routing": row.get("routing", ""),
            "Source File": source_file,
        })


# ---------- Towpath CRM push (Supabase) ----------
# Mirrors js/remote.js: password sign in, cache the refresh token locally, plain REST calls.
# The publishable key above can't read or write anything on its own; a signed-in owner is required.

def _auth_call(grant: str, body: dict) -> dict:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type={grant}",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json=body, timeout=20,
    )
    j = r.json() if r.content else {}
    if not r.ok:
        raise RuntimeError(j.get("msg") or j.get("error_description") or "CRM sign in failed.")
    return j


def _load_session():
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _save_session(sess: dict):
    SESSION_FILE.write_text(json.dumps(sess))


def get_access_token() -> str:
    sess = _load_session()
    if sess and sess.get("exp", 0) > time.time():
        return sess["access_token"]
    if sess and sess.get("refresh_token"):
        try:
            j = _auth_call("refresh_token", {"refresh_token": sess["refresh_token"]})
            sess = {"access_token": j["access_token"], "refresh_token": j["refresh_token"], "exp": time.time() + j.get("expires_in", 3600) - 60}
            _save_session(sess)
            return sess["access_token"]
        except RuntimeError:
            pass  # refresh token expired or revoked, fall through to a fresh sign in

    email = os.environ.get("TOWPATH_CRM_EMAIL") or input("Towpath CRM email: ").strip()
    password = os.environ.get("TOWPATH_CRM_PASSWORD") or getpass.getpass("Towpath CRM password: ")
    j = _auth_call("password", {"email": email, "password": password})
    sess = {"access_token": j["access_token"], "refresh_token": j["refresh_token"], "exp": time.time() + j.get("expires_in", 3600) - 60}
    _save_session(sess)
    return sess["access_token"]


def push_to_crm(result: dict, source_file: str):
    """Upserts one row into the seo_vault table, in the { id, data, updated_at } shape the CRM reads."""
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": str(uuid.uuid4()),
        "data": {
            "tip": result.get("tip", ""),
            "creator": result.get("creator", "Unknown"),
            "category": result.get("category", ""),
            "accuracy": result.get("accuracy", ""),
            "accuracyReason": result.get("accuracy_reason", ""),
            "towpathService": result.get("towpath_service", ""),
            "steps": result.get("implementation_steps", ""),
            "effort": result.get("effort", ""),
            "impact": result.get("impact", ""),
            "routing": result.get("routing", ""),
            "sourceFile": source_file,
            "createdAt": now,
        },
        "updated_at": now,
    }
    token = get_access_token()
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/seo_vault?on_conflict=id",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=row, timeout=20,
    )
    if not r.ok:
        raise RuntimeError(f"CRM push failed ({r.status_code}): {r.text[:200]}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 tools/seo_vault_pipeline.py <folder_of_videos>")
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_dir():
        print(f"Folder not found: {folder}")
        sys.exit(1)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Set GEMINI_API_KEY as an environment variable first. Free key: https://aistudio.google.com/apikey")
        sys.exit(1)

    print(f"Loading Whisper model ({WHISPER_MODEL_SIZE})...")
    whisper_model = whisper.load_model(WHISPER_MODEL_SIZE)

    captions = load_captions(folder)

    video_files = [f for f in folder.iterdir() if f.suffix.lower() in (".mp4", ".mov", ".m4v")]
    if not video_files:
        print("No video files found in that folder.")
        sys.exit(0)

    print(f"Found {len(video_files)} video(s). Processing...\n")

    for video_path in video_files:
        print(f"--- {video_path.name} ---")
        work_dir = folder / f"_work_{video_path.stem}"
        work_dir.mkdir(exist_ok=True)

        try:
            wav_path = work_dir / "audio.wav"
            print("  extracting audio...")
            extract_audio(video_path, wav_path)

            print("  transcribing...")
            transcript = transcribe(whisper_model, wav_path)

            print("  extracting frames...")
            frame_paths = extract_frames(video_path, work_dir, FRAMES_PER_VIDEO)

            caption = captions.get(video_path.name, "")

            print("  summarizing with Gemini...")
            result = summarize_with_gemini(api_key, transcript, caption, frame_paths)

            append_to_csv(result, video_path.name)

            try:
                print("  pushing to the CRM...")
                push_to_crm(result, video_path.name)
                print(f"  done -> {result.get('tip', '')[:80]}\n")
            except (RuntimeError, requests.RequestException) as e:
                print(f"  saved to CSV, but the CRM push failed: {e}\n")

        except Exception as e:
            print(f"  FAILED: {e}\n")

        finally:
            # clean up working files for this video
            for f in work_dir.glob("*"):
                f.unlink()
            work_dir.rmdir()

    print(f"All done. Local backup written to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
