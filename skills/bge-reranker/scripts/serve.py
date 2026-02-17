from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from transformers import AutoTokenizer
    from optimum.onnxruntime import ORTModelForSequenceClassification
except Exception as exc:  # pragma: no cover - runtime dependency check
    raise SystemExit(
        "Missing dependencies. Install with: pip install -r scripts/requirements.txt"
    ) from exc


class RerankCandidate(BaseModel):
    title: str = ""
    url: str = ""
    snippet: str = ""


class RerankRequest(BaseModel):
    query: str
    candidates: List[RerankCandidate] = Field(default_factory=list)
    maxLength: int | None = None


class RerankResponse(BaseModel):
    scores: List[float]


app = FastAPI(title="BGE Reranker")

MODEL_NAME = os.getenv("BGE_RERANK_MODEL", "BAAI/bge-reranker-base")
DEVICE = os.getenv("BGE_RERANK_DEVICE", "cpu")
PROVIDER = os.getenv("BGE_RERANK_PROVIDER", "CPUExecutionProvider")
DEFAULT_MAX_LENGTH = int(os.getenv("BGE_RERANK_MAX_LENGTH", "256"))


def _join_text(candidate: RerankCandidate) -> str:
    parts = [candidate.title.strip(), candidate.snippet.strip()]
    return "\n".join([part for part in parts if part])


def _load_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = ORTModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        export=True,
        provider=PROVIDER,
    )
    return tokenizer, model


TOKENIZER, MODEL = _load_model()


@app.post("/rerank", response_model=RerankResponse)
def rerank(request: RerankRequest) -> RerankResponse:
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    if not request.candidates:
        return RerankResponse(scores=[])

    max_length = request.maxLength or DEFAULT_MAX_LENGTH
    pairs = [(request.query, _join_text(candidate)) for candidate in request.candidates]

    inputs = TOKENIZER(
        [pair[0] for pair in pairs],
        [pair[1] for pair in pairs],
        padding=True,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )

    outputs = MODEL(**inputs)
    logits = outputs.logits.squeeze(-1).tolist()
    if isinstance(logits, float):
        logits = [logits]

    scores = [float(score) for score in logits]
    return RerankResponse(scores=scores)


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("BGE_RERANK_HOST", "127.0.0.1")
    port = int(os.getenv("BGE_RERANK_PORT", "8899"))
    uvicorn.run(app, host=host, port=port)
