FROM mambaorg/micromamba:2.0.5

ARG MAMBA_DOCKERFILE_ACTIVATE=1

USER root

RUN mkdir -p /models/mfa /data /app \
    && chown -R $MAMBA_USER:$MAMBA_USER /models /data /app \
    && chmod -R a+rwX /models /data

USER $MAMBA_USER

ENV MFA_ROOT_DIR=/models/mfa
ENV PATH=/opt/conda/bin:$PATH
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN micromamba install -y -n base -c conda-forge python=3.11 montreal-forced-aligner pip \
    && micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER docker/patch_mfa.py ./docker/patch_mfa.py

RUN python /app/docker/patch_mfa.py \
    && mfa model download acoustic english_us_arpa \
    && mfa model download dictionary english_us_arpa \
    && mfa model download acoustic russian_mfa \
    && mfa model download dictionary russian_mfa

COPY --chown=$MAMBA_USER:$MAMBA_USER pyproject.toml MFA_POC.md ./
COPY --chown=$MAMBA_USER:$MAMBA_USER src ./src
COPY --chown=$MAMBA_USER:$MAMBA_USER docker/entrypoint.sh ./docker/entrypoint.sh

RUN python -m pip install --no-cache-dir --no-deps -e /app

WORKDIR /data

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["--help"]
