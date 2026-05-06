from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

from .textgrid import Word, parse_words_tier
from .srt import cues_from_words, write_srt
from .transcript import align_words_to_transcript, transcript_text_for_alignment


class SyncMFAError(RuntimeError):
    """Raised when the MFA subtitle workflow cannot continue."""


@dataclass(frozen=True)
class SyncOptions:
    audio: Path
    text: Path
    out: Path
    language: str = "english_us_arpa"
    keep_workdir: bool = False
    max_words_per_cue: int = 14
    max_cue_duration: float = 6.0
    max_line_chars: int = 72
    pause_threshold: float = 0.6
    sentence_mode: Literal["balanced", "strict"] = "balanced"
    skip_validate: bool = False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sync-subtitles-mfa",
        description="Align an audio file with a matching transcript and write SRT subtitles.",
    )
    parser.add_argument("--audio", required=True, type=Path, help="Input audio file, such as mp3, wav, or m4a.")
    parser.add_argument("--text", required=True, type=Path, help="Matching plain-text transcript.")
    parser.add_argument("--out", required=True, type=Path, help="Output .srt path.")
    parser.add_argument("--language", default="english_us_arpa", help="MFA acoustic and dictionary model name.")
    parser.add_argument("--keep-workdir", action="store_true", help="Keep the temporary MFA work directory.")
    parser.add_argument("--max-words-per-cue", type=int, default=14, help="Maximum words in one subtitle cue.")
    parser.add_argument("--max-cue-duration", type=float, default=6.0, help="Maximum duration in seconds for one cue.")
    parser.add_argument("--max-line-chars", type=int, default=72, help="Maximum characters per subtitle text line.")
    parser.add_argument("--pause-threshold", type=float, default=0.6, help="Start a new cue after this silence gap.")
    parser.add_argument(
        "--skip-validate",
        action="store_true",
        help="Skip mfa validate and run alignment directly. Useful for slow Docker/emulated environments.",
    )
    parser.add_argument(
        "--sentence-mode",
        choices=["balanced", "strict"],
        default="balanced",
        help="Use balanced subtitle lengths or keep each sentence together where possible.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        options = SyncOptions(
            audio=args.audio,
            text=args.text,
            out=args.out,
            language=args.language,
            keep_workdir=args.keep_workdir,
            max_words_per_cue=args.max_words_per_cue,
            max_cue_duration=args.max_cue_duration,
            max_line_chars=args.max_line_chars,
            pause_threshold=args.pause_threshold,
            sentence_mode=args.sentence_mode,
            skip_validate=args.skip_validate,
        )
        result = sync_subtitles(options)
    except SyncMFAError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(result)
    return 0


def sync_subtitles(options: SyncOptions) -> Path:
    validate_options(options)
    command_env = build_command_env()
    ffmpeg = require_command("ffmpeg", command_env)
    mfa = require_command("mfa", command_env)

    work_root = Path(tempfile.mkdtemp(prefix="mfa-sync-"))
    try:
        return _sync_subtitles_in_workdir(options, work_root, ffmpeg=ffmpeg, mfa=mfa, command_env=command_env)
    finally:
        if options.keep_workdir:
            print(f"kept workdir: {work_root}", file=sys.stderr)
        else:
            shutil.rmtree(work_root, ignore_errors=True)


def validate_options(options: SyncOptions) -> None:
    if not options.audio.is_file():
        raise SyncMFAError(f"audio file does not exist: {options.audio}")
    if not options.text.is_file():
        raise SyncMFAError(f"text file does not exist: {options.text}")
    if options.max_words_per_cue <= 0:
        raise SyncMFAError("--max-words-per-cue must be greater than zero")
    if options.max_cue_duration <= 0:
        raise SyncMFAError("--max-cue-duration must be greater than zero")
    if options.max_line_chars <= 0:
        raise SyncMFAError("--max-line-chars must be greater than zero")
    if options.pause_threshold < 0:
        raise SyncMFAError("--pause-threshold cannot be negative")


def build_command_env() -> dict[str, str]:
    env = os.environ.copy()
    repo_root = Path(__file__).resolve().parents[2]
    for env_name in ("aligner311", "aligner"):
        local_env_bin = repo_root / ".mamba" / "envs" / env_name / "bin"
        if local_env_bin.is_dir():
            env["PATH"] = f"{local_env_bin}{os.pathsep}{env.get('PATH', '')}"
            break
    env.setdefault("MFA_ROOT_DIR", str(repo_root / ".mfa"))
    return env


def require_command(command: str, env: dict[str, str]) -> str:
    path = shutil.which(command, path=env.get("PATH"))
    if path is None:
        raise SyncMFAError(f"{command} is not installed or is not on PATH")
    return path


def _sync_subtitles_in_workdir(
    options: SyncOptions,
    work_root: Path,
    *,
    ffmpeg: str,
    mfa: str,
    command_env: dict[str, str],
) -> Path:
    corpus_speaker_dir = work_root / "corpus" / "speaker1"
    aligned_dir = work_root / "aligned"
    corpus_speaker_dir.mkdir(parents=True, exist_ok=True)
    aligned_dir.mkdir(parents=True, exist_ok=True)

    stem = options.audio.stem
    wav_path = corpus_speaker_dir / f"{stem}.wav"
    lab_path = corpus_speaker_dir / f"{stem}.lab"

    run_command(
        [
            ffmpeg,
            "-y",
            "-i",
            str(options.audio),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            str(wav_path),
        ],
        "ffmpeg audio normalization failed",
        env=command_env,
    )
    write_lab_file(options.text, lab_path)

    corpus_dir = work_root / "corpus"
    if not options.skip_validate:
        run_command(
            [
                mfa,
                "validate",
                str(corpus_dir),
                options.language,
                "--acoustic_model_path",
                options.language,
                "--clean",
                "--single_speaker",
            ],
            "mfa validate failed",
            env=command_env,
        )
    run_command(
        [
            mfa,
            "align",
            str(corpus_dir),
            options.language,
            options.language,
            str(aligned_dir),
            "--clean",
            "--single_speaker",
        ],
        "mfa align failed",
        env=command_env,
    )

    textgrid = find_textgrid(aligned_dir, stem)
    try:
        words = parse_words_tier(textgrid)
    except ValueError as exc:
        raise SyncMFAError(str(exc)) from exc
    if not words:
        raise SyncMFAError(f"TextGrid words tier is empty: {textgrid}")

    transcript = options.text.read_text(encoding="utf-8")
    display_words = align_words_to_transcript(words, transcript)

    cues = cues_from_words(
        display_words,
        max_words_per_cue=options.max_words_per_cue,
        max_cue_duration=options.max_cue_duration,
        max_line_chars=options.max_line_chars,
        pause_threshold=options.pause_threshold,
        sentence_mode=options.sentence_mode,
    )
    if not cues:
        raise SyncMFAError("generated SRT would be empty")

    options.out.parent.mkdir(parents=True, exist_ok=True)
    write_srt(cues, options.out)
    return options.out


def write_lab_file(text_path: Path, lab_path: Path) -> None:
    raw = text_path.read_text(encoding="utf-8")
    normalized = transcript_text_for_alignment(raw)
    if not normalized:
        raise SyncMFAError(f"transcript is empty: {text_path}")
    lab_path.write_text(normalized + "\n", encoding="utf-8")


def run_command(command: Sequence[str], failure_message: str, *, env: dict[str, str] | None = None) -> None:
    try:
        completed = subprocess.run(
            list(command),
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
    except FileNotFoundError as exc:
        raise SyncMFAError(f"{command[0]} is not installed or is not on PATH") from exc

    if completed.returncode != 0:
        details = "\n".join(part for part in (completed.stdout.strip(), completed.stderr.strip()) if part)
        if details:
            raise SyncMFAError(f"{failure_message}\n{details}")
        raise SyncMFAError(failure_message)


def find_textgrid(aligned_dir: Path, stem: str) -> Path:
    expected = aligned_dir / "speaker1" / f"{stem}.TextGrid"
    if expected.is_file():
        return expected

    matches = sorted(aligned_dir.rglob(f"{stem}.TextGrid"))
    if matches:
        return matches[0]

    all_textgrids = sorted(aligned_dir.rglob("*.TextGrid"))
    if len(all_textgrids) == 1:
        return all_textgrids[0]

    raise SyncMFAError(f"mfa align did not create {stem}.TextGrid under {aligned_dir}")
