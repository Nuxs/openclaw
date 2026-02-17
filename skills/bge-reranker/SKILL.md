---
name: bge-reranker
description: Local BGE reranker HTTP service for OpenClaw web_search (SearxNG) with CPU/GPU modes.
---

# bge-reranker

Local BGE reranker HTTP service for `web_search` (SearxNG). Designed for CPU-first usage with optional GPU acceleration and OpenClaw-side fallback.

## Install

Create a Python environment, then install dependencies:

```bash
pip install -r {baseDir}/scripts/requirements.txt
```

For CUDA GPUs, replace the CPU runtime with the GPU build:

```bash
pip uninstall -y onnxruntime
pip install onnxruntime-gpu
```

## Run

```bash
python {baseDir}/scripts/serve.py
```

Environment variables (optional):

- `BGE_RERANK_MODEL` (default: `BAAI/bge-reranker-base`)
- `BGE_RERANK_DEVICE` (default: `cpu`)
- `BGE_RERANK_PROVIDER` (default: `CPUExecutionProvider`, use `CUDAExecutionProvider` for GPU)
- `BGE_RERANK_HOST` (default: `127.0.0.1`)
- `BGE_RERANK_PORT` (default: `8899`)
- `BGE_RERANK_MAX_LENGTH` (default: `256`)

## OpenClaw config

```yaml
tools:
  web:
    search:
      provider: searxng
      searxng:
        baseUrl: https://search.example.com
        rerank:
          mode: auto
          endpoint: http://127.0.0.1:8899/rerank
          timeoutSeconds: 1
          maxCandidates: 20
          maxLength: 256
```

## API contract

### Request

- Method: `POST`
- Path: `/rerank`
- Body:
  - `query`: string
  - `candidates`: array of `{ title, url, snippet }`
  - `maxLength` (optional): number

### Response

- Body:
  - `scores`: array of numbers aligned to `candidates`
