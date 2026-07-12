FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

WORKDIR /service

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "setuptools<82" \
  && python -m pip install --no-cache-dir \
    "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@0f378e9d8dd72630c911025b555f18658d44cc8f"

COPY server.py transcribe.py ./

EXPOSE 3300

CMD ["python", "server.py"]
