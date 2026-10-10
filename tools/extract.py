"""
Local-only half of the SEO Vault pipeline: extracts audio, transcribes it with Whisper,
and pulls key frames, for every video in a folder. No API key, no network call except
whatever Whisper needs on first run to download its model (also free).

Leaves everything under tools/_out/<video-stem>/ (transcript.txt, frame_1.jpg ... frame_N.jpg)
for something else (a human, or Claude reading it directly) to turn into an SEO tip and hand
to push_tip.py.

Usage: tools/.venv/bin/python tools/extract.py <folder_of_videos>
"""
import sys
from pathlib import Path

import whisper

from seo_vault_pipeline import extract_audio, extract_frames, transcribe, load_captions, WHISPER_MODEL_SIZE, FRAMES_PER_VIDEO, SCRIPT_DIR

OUT_DIR = SCRIPT_DIR / "_out"


def main():
    if len(sys.argv) < 2:
        print("Usage: tools/.venv/bin/python tools/extract.py <folder_of_videos>")
        sys.exit(1)

    folder = Path(sys.argv[1]).expanduser()
    if not folder.is_dir():
        print(f"Folder not found: {folder}")
        sys.exit(1)

    print(f"Loading Whisper model ({WHISPER_MODEL_SIZE})...")
    model = whisper.load_model(WHISPER_MODEL_SIZE)
    captions = load_captions(folder)

    video_files = sorted(f for f in folder.iterdir() if f.suffix.lower() in (".mp4", ".mov", ".m4v"))
    if not video_files:
        print("No video files found in that folder.")
        sys.exit(0)

    OUT_DIR.mkdir(exist_ok=True)
    print(f"Found {len(video_files)} video(s).\n")

    for video_path in video_files:
        stem_dir = OUT_DIR / video_path.stem
        if (stem_dir / "transcript.txt").exists():
            print(f"--- {video_path.name} (already extracted, skipping) ---")
            continue

        print(f"--- {video_path.name} ---")
        stem_dir.mkdir(parents=True, exist_ok=True)

        wav_path = stem_dir / "audio.wav"
        print("  extracting audio...")
        extract_audio(video_path, wav_path)

        print("  transcribing...")
        transcript = transcribe(model, wav_path)
        (stem_dir / "transcript.txt").write_text(transcript)

        print("  extracting frames...")
        extract_frames(video_path, stem_dir, FRAMES_PER_VIDEO)

        caption = captions.get(video_path.name, "")
        (stem_dir / "caption.txt").write_text(caption)

        wav_path.unlink()
        print(f"  done -> {stem_dir}\n")

    print(f"All extracted. See {OUT_DIR}")


if __name__ == "__main__":
    main()
