"""Ponto de entrada FastAPI para o Motor Matemático LOTUS AI (Execução Externa)."""

from fastapi import FastAPI, HTTPException
from .core.axioms import (
    DISTRIBUTION_SUM_TOLERANCE,
    INDEPENDENCE_AXIOM_STATEMENT,
    exact_combination_count,
    theoretical_distribution_detailed,
)
from .core.contracts import (
    HitProbabilityDetail,
    SpecializedProbabilityRequest,
    TheoreticalProbabilityRequest,
    TheoreticalProbabilityResponse,
)
from .models import list_registered_models, resolve_lottery_model

app = FastAPI(
    title="LOTUS AI Mathematical Engine",
    version="0.4.0",
    description=(
        "Motor matemático especializado por modalidade para cálculo combinatório racional exato, "
        "faixas de premiação, apostas simples vs. múltiplas e memória de cálculo."
    ),
)


@app.get("/health")
def health():
    return {
        "status": "ready",
        "service": "lotus-math-engine",
        "execution_source": "python_fastapi_engine",
        "stage": "etapa-2-motor-especializado",
        "axiom": INDEPENDENCE_AXIOM_STATEMENT,
    }


@app.get("/v1/models")
def get_registered_models():
    return {
        "execution_source": "python_fastapi_engine",
        "models": list_registered_models(),
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
    dist_sum = sum(item.probability for item in dist_formatted.values())

    return TheoreticalProbabilityResponse(
        lottery_code=payload.lottery_code,
        universe_size=payload.universe_size,
        drawn_count=payload.drawn_count,
        chosen_count=payload.chosen_count,
        total_combinations=str(total),
        distribution_by_hits=dist_formatted,
        distribution_sum=dist_sum,
        distribution_sum_tolerance=DISTRIBUTION_SUM_TOLERANCE,
        axiom_notice=INDEPENDENCE_AXIOM_STATEMENT,
        execution_source="python_fastapi_engine",
        engine_status="verified_combinatorics",
    )


@app.post("/v1/probabilities/specialized")
def compute_specialized_probability(payload: SpecializedProbabilityRequest):
    try:
        model = resolve_lottery_model(payload.lottery_code, payload.math_model_type)
        min_choose = (
            payload.min_numbers_to_choose
            if payload.min_numbers_to_choose is not None
            else payload.chosen_count
        )
        max_choose = (
            payload.max_numbers_to_choose
            if payload.max_numbers_to_choose is not None
            else payload.chosen_count
        )
        return model.compute_specialized(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=[t.model_dump() for t in payload.prize_tiers],
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
            simple_games_count=payload.simple_games_count,
        )
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
