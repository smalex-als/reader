from __future__ import annotations

import pathlib
import site


OLD = 'logger.warning(len(self.excluded_phones), "phones not in acoustic model")'
NEW = 'logger.warning(f"{len(self.excluded_phones)} phones not in acoustic model")'
OLD_2 = 'logger.warning(self.excluded_pronunciation_count, "ignored pronunciations")'
NEW_2 = 'logger.warning(f"{self.excluded_pronunciation_count} ignored pronunciations")'


def main() -> None:
    candidates: list[pathlib.Path] = []
    for site_dir in site.getsitepackages():
        candidates.extend(
            pathlib.Path(site_dir).glob(
                "montreal_forced_aligner/validation/corpus_validator.py"
            )
        )

    if not candidates:
        raise SystemExit("Could not find MFA corpus_validator.py")

    for path in candidates:
        text = path.read_text(encoding="utf-8")
        patched = text.replace(OLD, NEW).replace(OLD_2, NEW_2)
        if patched != text:
            path.write_text(patched, encoding="utf-8")
            print(f"Patched {path}")
            return

    print("MFA validation logging patch already applied or no longer needed")


if __name__ == "__main__":
    main()
