#!/usr/bin/env python3
import argparse
import base64
import json
import mimetypes
import sys
from pathlib import Path

from openai import OpenAI


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-key", default="EMPTY")
    parser.add_argument("--model", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--max-tokens", type=int, default=4096)
    parser.add_argument("--extra-body", default="")
    return parser.parse_args()


def to_image_url(value: str) -> str:
    if value.startswith(("http://", "https://", "data:", "file://")):
        return value

    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")

    mime_type, _ = mimetypes.guess_type(path.name)
    if not mime_type:
        mime_type = "application/octet-stream"

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def main() -> int:
    args = parse_args()
    image_url = to_image_url(args.image)
    extra_body = json.loads(args.extra_body) if args.extra_body.strip() else None

    client = OpenAI(
        api_key=args.api_key,
        base_url=args.base_url,
        timeout=3600,
    )

    response = client.chat.completions.create(
        model=args.model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url},
                    },
                    {
                        "type": "text",
                        "text": args.prompt,
                    },
                ],
            }
        ],
        max_tokens=args.max_tokens,
        temperature=0.0,
        extra_body=extra_body,
    )

    content = response.choices[0].message.content
    if isinstance(content, list):
      print("".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in content))
    else:
      print(content or "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
