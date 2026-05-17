from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal, Sequence

from .textgrid import Word

MIN_SUBTITLE_CUE_CHARS = 32
MIN_SUBTITLE_CUE_WORDS = 6
MAX_MERGED_SUBTITLE_CUE_CHARS = 140
MAX_MERGED_SUBTITLE_CUE_SECONDS = 12.0


@dataclass(frozen=True)
class Cue:
    start: float
    end: float
    text: str


def cues_from_words(
    words: Iterable[Word],
    *,
    max_words_per_cue: int = 14,
    max_cue_duration: float = 6.0,
    max_line_chars: int = 72,
    pause_threshold: float = 0.6,
    sentence_mode: Literal["balanced", "strict"] = "balanced",
) -> list[Cue]:
    cues: list[Cue] = []
    current: list[Word] = []

    for word in words:
        if not word.text:
            continue

        if current and should_start_new_cue(
            current,
            word,
            max_words_per_cue=max_words_per_cue,
            max_cue_duration=max_cue_duration,
            pause_threshold=pause_threshold,
            sentence_mode=sentence_mode,
        ):
            cues.append(cue_from_words(current, max_line_chars=max_line_chars))
            current = []

        current.append(word)

    if current:
        cues.append(cue_from_words(current, max_line_chars=max_line_chars))

    return merge_short_cues(cues)


def merge_short_cues(
    cues: Sequence[Cue],
    *,
    min_chars: int = MIN_SUBTITLE_CUE_CHARS,
    min_words: int = MIN_SUBTITLE_CUE_WORDS,
    max_chars: int = MAX_MERGED_SUBTITLE_CUE_CHARS,
    max_duration: float = MAX_MERGED_SUBTITLE_CUE_SECONDS,
) -> list[Cue]:
    merged: list[Cue] = []
    pending: Cue | None = None
    pending_started_small = False
    pending_merged = False

    for cue in cues:
        if pending is None:
            pending = cue
            pending_started_small = is_small_cue(cue, min_chars=min_chars, min_words=min_words)
            pending_merged = False
        elif (
            pending_started_small
            or (ends_incomplete(pending.text) and is_small_cue(cue, min_chars=min_chars, min_words=min_words))
        ) and can_merge_cues(
            pending,
            cue,
            max_chars=max_chars,
            max_duration=max_duration,
        ) and not (
            pending_merged
            and starts_new_sentence_after_terminal(pending.text, cue.text)
        ):
            pending = Cue(
                start=pending.start,
                end=cue.end,
                text=join_cue_text(pending.text, cue.text),
            )
            pending_merged = True
        else:
            merged.append(pending)
            pending = cue
            pending_started_small = is_small_cue(cue, min_chars=min_chars, min_words=min_words)
            pending_merged = False

    if pending is not None:
        merged.append(pending)

    return merged


def is_small_cue(cue: Cue, *, min_chars: int, min_words: int) -> bool:
    text = cue.text.strip()
    return len(text) < min_chars or len(text.split()) <= min_words


def ends_incomplete(text: str) -> bool:
    return text.rstrip().endswith((",", ";", ":", "-", "—", "–"))


def starts_new_sentence_after_terminal(left: str, right: str) -> bool:
    left = left.rstrip()
    right = right.lstrip()
    return bool(left and right and left[-1] in ".?!" and right[0].isupper())


def can_merge_cues(
    left: Cue,
    right: Cue,
    *,
    max_chars: int,
    max_duration: float,
) -> bool:
    text = join_cue_text(left.text, right.text)
    return len(text) <= max_chars and right.end - left.start <= max_duration


def join_cue_text(left: str, right: str) -> str:
    return f"{left.strip()} {right.strip()}".strip()


def should_start_new_cue(
    current: Sequence[Word],
    next_word: Word,
    *,
    max_words_per_cue: int,
    max_cue_duration: float,
    pause_threshold: float,
    sentence_mode: Literal["balanced", "strict"],
) -> bool:
    gap = next_word.start - current[-1].end
    if sentence_mode == "strict":
        if ends_sentence(current[-1].text):
            return True
        return gap > pause_threshold and len(current) >= 4

    if gap > pause_threshold:
        return True
    if ends_sentence(current[-1].text) and len(current) >= 4:
        return True
    if len(current) >= max_words_per_cue:
        return True
    if next_word.end - current[0].start > max_cue_duration:
        return True
    return False


def cue_from_words(words: Sequence[Word], *, max_line_chars: int = 72) -> Cue:
    return Cue(
        start=words[0].start,
        end=words[-1].end,
        text=format_cue_text([word.text for word in words], max_line_chars=max_line_chars),
    )


def format_cue_text(words: Sequence[str], *, max_line_chars: int = 72) -> str:
    return "\n".join(wrap_words(words, max_line_chars=max_line_chars))


def wrap_words(words: Sequence[str], max_line_chars: int = 72) -> list[str]:
    lines: list[str] = []
    current: list[str] = []

    for word in words:
        candidate = join_words([*current, word])
        if current and len(candidate) > max_line_chars and not current[-1].endswith("-"):
            lines.append(join_words(current))
            current = [word]
        else:
            current.append(word)

    if current:
        lines.append(join_words(current))

    return lines


def join_words(words: Sequence[str]) -> str:
    text = ""
    for word in words:
        if not text:
            text = word
        elif text.endswith("-"):
            text += word
        else:
            text += " " + word
    return text


def ends_sentence(value: str) -> bool:
    return value.rstrip("\"')]}").endswith((".", "?", "!"))


def write_srt(cues: Sequence[Cue], out: Path) -> None:
    lines: list[str] = []
    for index, cue in enumerate(cues, start=1):
        lines.extend(
            [
                str(index),
                f"{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}",
                cue.text,
                "",
            ]
        )

    out.write_text("\n".join(lines), encoding="utf-8")


def format_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{millis:03}"
