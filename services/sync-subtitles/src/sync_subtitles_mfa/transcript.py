from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable

from .textgrid import Word


@dataclass(frozen=True)
class TranscriptToken:
    surface: str
    key: str

    @property
    def sentence_end(self) -> bool:
        return self.surface.rstrip("\"')]}").endswith((".", "?", "!"))


WORD_RE = re.compile(r"[^\W_]+(?:[’'][^\W_]+)?|[^\W_]+", re.UNICODE)


def align_words_to_transcript(words: Iterable[Word], transcript: str) -> list[Word]:
    """Replace MFA-normalized word text with source transcript token text when possible."""
    tokens = tokenize_transcript(transcript)
    token_index = 0
    aligned: list[Word] = []

    for word in words:
        key = normalize_token(word.text)
        match_index = find_next_token(tokens, key, token_index)
        if match_index is None:
            aligned.append(word)
            continue

        token = tokens[match_index]
        aligned.append(Word(word.start, word.end, token.surface))
        token_index = match_index + 1

    return aligned


def transcript_text_for_alignment(transcript: str) -> str:
    """Return a punctuation-light transcript for MFA corpus .lab files."""
    words: list[str] = []
    for token in tokenize_transcript(transcript):
        surface = token.surface.rstrip("-")
        surface = surface.strip(".,!?;:\"')]}“”")
        if surface:
            words.append(surface)
    return " ".join(words)


def tokenize_transcript(transcript: str) -> list[TranscriptToken]:
    tokens: list[TranscriptToken] = []

    for raw in transcript.split():
        raw = raw.strip()
        if not raw or raw in {"#", "##", "###", "-", "*"}:
            continue

        raw = raw.lstrip("#>*")
        raw = raw.strip()
        if not raw:
            continue

        parts = split_word_parts(raw)
        for index, part in enumerate(parts):
            key = normalize_token(part)
            if not key:
                continue
            surface = part
            if index < len(parts) - 1 and raw_has_inner_separator(raw, part):
                surface = surface + "-"
            tokens.append(TranscriptToken(surface=surface, key=key))

    return tokens


def split_word_parts(raw: str) -> list[str]:
    matches = list(WORD_RE.finditer(raw))
    if not matches:
        return []

    parts: list[str] = []
    for index, match in enumerate(matches):
        part = match.group(0)
        if index == len(matches) - 1:
            suffix = sentence_suffix(raw[match.end() :])
            part += suffix
        parts.append(strip_wrapping_punctuation(part))

    return [part for part in parts if part]


def sentence_suffix(value: str) -> str:
    suffix = ""
    for char in value:
        if char in ".,!?;:\"')]}":
            suffix += char
    return suffix


def strip_wrapping_punctuation(value: str) -> str:
    return value.strip("“”\"'([{")


def raw_has_inner_separator(raw: str, part: str) -> bool:
    del part
    return "-" in raw or "‑" in raw or "–" in raw


def find_next_token(tokens: list[TranscriptToken], key: str, start: int) -> int | None:
    if not key:
        return None

    search_limit = min(len(tokens), start + 80)
    for index in range(start, search_limit):
        if tokens[index].key == key:
            return index
    return None


def normalize_token(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("’", "'").replace("‘", "'").replace("`", "'")
    value = value.lower()
    return "".join(char for char in value if char.isalnum() or char == "'")
