"""Ponto de entrada FastAPI para o Motor Matemático LOTUS AI (Execução Externa)."""

from fastapi import FastAPI, HTTPException
from .core.axioms import (
    INDEPENDENCE_AXIOM_STATEMENT,
    exact_combination_count,
    theoretical_distribution_detailed,
)
from .core.contracts import (
    HitProbabilityDetail,
    TheoreticalProbabilityRequest,
    TheoreticalProbabilityResponse,
)

app = FastAPI(
    title="LOTUS AI Mathematical Engine",
    version="0.2.0",
    description="Motor matemático científico isolado para cálculo combinatório, estatística, Monte Carlo e backtesting.",
)


@app.get("/health")
def health():
    return {
        "status": "ready",
        "service": "lotus-math-engine",
        "execution_source": "python_fastapi_engine",
        "stage": "etapa-1-fundacao",
        "axiom": INDEPENDENCE_AXIOM_STATEMENT,
    }


@app.post("/v1/probabilities/theoretical", response_model=TheoreticalProbabilityResponse)
def compute_theoretical_probability(payload: TheoreticalProbabilityRequest):
    if payload.chosen_count > payload.universe_size or payload.drawn_count > payload.universe_size:
        raise HTTPException(
            status_code=422,
            detail="chosen_count e drawn_count devem ser <= universe_size.",
        )

    total = exact_combination_count(payload.universe_size, payload.chosen_count)
    dist_raw = theoretical_distribution_detailed(
        payload.universe_size,
        payload.drawn_count,
        payload.chosen_count,
    )
    dist_formatted = {
        str(h): HitProbabilityDetail(**detail) for h, detail in dist_raw.items()
    }

    return TheoreticalProbabilityResponse(
        lottery_code=payload.lottery_code,
        total_combinations=str(total),
        distribution_by_hits=dist_formatted,
        axiom_notice=INDEPENDENCE_AXIOM_STATEMENT,
        execution_source="python_fastapi_engine",
        engine_status="verified_combinatorics",
    )
