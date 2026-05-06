# Docker usage

Build the image:

```sh
docker build --platform linux/amd64 -t sync-subtitles-mfa:local .
```

Run English alignment:

```sh
mkdir -p output && chmod 777 output

docker run --rm \
  -v "$PWD:/data" \
  sync-subtitles-mfa:local \
  --audio test/chapter009.mp3 \
  --text test/chapter009.txt \
  --out output/chapter009.srt \
  --language english_us_arpa \
  --sentence-mode strict \
  --max-line-chars 95 \
  --beam 100 \
  --retry-beam 400
```

Run Russian alignment:

```sh
mkdir -p output && chmod 777 output

docker run --rm \
  -v "$PWD:/data" \
  sync-subtitles-mfa:local \
  --audio test/chapter005.v1.mp3 \
  --text test/chapter005.v1.txt \
  --out output/chapter005.v1.srt \
  --language russian_mfa \
  --skip-validate \
  --sentence-mode strict \
  --max-line-chars 95 \
  --beam 100 \
  --retry-beam 400
```

Docker Compose equivalent:

```sh
docker compose run --rm sync-subtitles \
  --audio test/chapter005.v1.mp3 \
  --text test/chapter005.v1.txt \
  --out output/chapter005.v1.srt \
  --language russian_mfa \
  --skip-validate \
  --sentence-mode strict \
  --max-line-chars 95 \
  --beam 100 \
  --retry-beam 400
```

Run as an HTTP service:

```sh
docker run --rm \
  -p 3100:3100 \
  -v "$PWD:/data" \
  sync-subtitles-mfa:local \
  serve
```

Health check:

```sh
curl http://localhost:3100/health
```

Generate subtitles through the service:

```sh
curl -o output/chapter009.srt \
  -X POST http://localhost:3100/generate \
  -H 'content-type: application/json' \
  -d '{
    "audio": "test/chapter009.mp3",
    "text": "test/chapter009.txt",
    "out": "output/chapter009.srt",
    "language": "english_us_arpa",
    "skipValidate": true,
    "sentenceMode": "strict",
    "maxLineChars": 95,
    "beam": 100,
    "retryBeam": 400
  }'
```

The HTTP service returns the generated SRT file as the response body. It does
not write the output file into `/data`; callers are responsible for saving it.

The image includes MFA, Python 3.11, `english_us_arpa`, and `russian_mfa`.
Input/output paths are relative to the mounted repository directory at `/data`.
On Linux bind mounts, create a writable `output/` directory before running the
container. Do not pass `--user`; MFA/Kaldi should run as the image's built-in
`mambauser`.

`linux/amd64` is intentional. MFA's conda dependency set is not complete for
`linux/arm64`, so Apple Silicon Docker builds need amd64 emulation.
On Apple Silicon, `mfa validate` is very slow under emulation, so the Docker
examples use `--skip-validate`.
