"""Ponto de entrada FastAPI para o Motor Matemático LOTUS AI (Execução Externa)."""

from fastapi import FastAPI, HTTPException
from .combinations import (
    analyze_bet_set,
    analyze_constrained_universe,
    analyze_subset_coverage,
    compare_strategies,
    generate_controlled_bets,
)
from .core.axioms import (
    DISTRIBUTION_SUM_TOLERANCE,
    INDEPENDENCE_AXIOM_STATEMENT,
    exact_combination_count,
    theoretical_distribution_detailed,
)
from .core.contracts import (
    CombinationsAnalyzeRequest,
    CombinationsCompareRequest,
    CombinationsCoverageRequest,
    CombinationsGenerateRequest,
    HitProbabilityDetail,
    SpecializedProbabilityRequest,
    TheoreticalProbabilityRequest,
    TheoreticalProbabilityResponse,
)
from .models import (
    UnregisteredLotteryError,
    list_registered_models,
    resolve_lottery_model,
    validate_specialized_lottery_params,
)

app = FastAPI(
    title="LOTUS AI Mathematical Engine",
    version="0.5.0",
    description=(
        "Motor matemático especializado por modalidade para cálculo combinatório racional exato, "
        "faixas de premiação, estudo de cobertura, geração controlada e comparação de estratégias."
    ),
)


@app.get("/health")
def health():
    return {
        "status": "ready",
        "service": "lotus-math-engine",
        "execution_source": "python_fastapi_engine",
        "stage": "etapa-3-laboratorio-combinacoes",
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
        prize_tier_dicts = [t.model_dump() for t in payload.prize_tiers]
        validate_specialized_lottery_params(
            lottery_code=payload.lottery_code,
            math_model_type=payload.math_model_type,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
        )
        model = resolve_lottery_model(payload.lottery_code, payload.math_model_type)
        return model.compute_specialized(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
            simple_games_count=payload.simple_games_count,
            simple_bets=payload.simple_bets,
        )
    except UnregisteredLotteryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/combinations/analyze")
def combinations_analyze_endpoint(payload: CombinationsAnalyzeRequest):
    try:
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
        prize_tier_dicts = [t.model_dump() for t in payload.prize_tiers]
        validate_specialized_lottery_params(
            lottery_code=payload.lottery_code,
            math_model_type=payload.math_model_type,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
        )
        universe_res = analyze_constrained_universe(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            fixed_numbers=payload.fixed_numbers,
            excluded_numbers=payload.excluded_numbers,
            variable_numbers=payload.variable_numbers,
            desired_games_count=payload.desired_games_count,
            max_budget_cents=payload.max_budget_cents,
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
        )
        bet_set_analysis = (
            analyze_bet_set(
                lottery_code=payload.lottery_code,
                universe_size=payload.universe_size,
                drawn_count=payload.drawn_count,
                chosen_count=payload.chosen_count,
                bets=payload.bets,
                fixed_numbers=universe_res["partition"]["fixed_numbers"],
                excluded_numbers=universe_res["partition"]["excluded_numbers"],
                simple_bet_price_cents=payload.simple_bet_price_cents,
                price_updated_at=payload.price_updated_at,
                price_source=payload.price_source,
            )
            if payload.bets is not None
            else None
        )
        return {
            **universe_res,
            "bet_set_analysis": bet_set_analysis,
        }
    except UnregisteredLotteryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/combinations/coverage")
def combinations_coverage_endpoint(payload: CombinationsCoverageRequest):
    try:
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
        prize_tier_dicts = [t.model_dump() for t in payload.prize_tiers]
        validate_specialized_lottery_params(
            lottery_code=payload.lottery_code,
            math_model_type=payload.math_model_type,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
        )
        return analyze_subset_coverage(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            bets=payload.bets,
            target_subset_size=payload.target_subset_size,
            pool_numbers=payload.pool_numbers,
            fixed_numbers=payload.fixed_numbers,
            excluded_numbers=payload.excluded_numbers,
        )
    except UnregisteredLotteryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/combinations/generate")
def combinations_generate_endpoint(payload: CombinationsGenerateRequest):
    try:
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
        prize_tier_dicts = [t.model_dump() for t in payload.prize_tiers]
        validate_specialized_lottery_params(
            lottery_code=payload.lottery_code,
            math_model_type=payload.math_model_type,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
        )
        generated = generate_controlled_bets(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            fixed_numbers=payload.fixed_numbers,
            excluded_numbers=payload.excluded_numbers,
            variable_numbers=payload.variable_numbers,
            desired_games_count=payload.desired_games_count,
            method=payload.method,
            coverage_target_t=payload.coverage_target_t,
            seed=payload.seed,
            max_budget_cents=payload.max_budget_cents,
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
            min_even=payload.min_even,
            max_even=payload.max_even,
            min_sum=payload.min_sum,
            max_sum=payload.max_sum,
            max_consecutive=payload.max_consecutive,
        )
        set_analysis = analyze_bet_set(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.chosen_count,
            bets=generated["generated_bets"],
            fixed_numbers=generated["partition"]["fixed_numbers"],
            excluded_numbers=generated["partition"]["excluded_numbers"],
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
        )
        return {
            **generated,
            "bet_set_analysis": set_analysis,
        }
    except UnregisteredLotteryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/combinations/compare")
def combinations_compare_endpoint(payload: CombinationsCompareRequest):
    try:
        min_choose = (
            payload.min_numbers_to_choose
            if payload.min_numbers_to_choose is not None
            else payload.drawn_count
        )
        max_choose = (
            payload.max_numbers_to_choose
            if payload.max_numbers_to_choose is not None
            else payload.universe_size
        )
        prize_tier_dicts = [t.model_dump() for t in payload.prize_tiers]
        spec = validate_specialized_lottery_params(
            lottery_code=payload.lottery_code,
            math_model_type=payload.math_model_type,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            chosen_count=payload.strategies[0].chosen_count,
            min_numbers_to_choose=min_choose,
            max_numbers_to_choose=max_choose,
            prize_tiers=prize_tier_dicts,
        )
        eff_min = spec.min_numbers_to_choose or min_choose
        eff_max = spec.max_numbers_to_choose or max_choose
        return compare_strategies(
            lottery_code=payload.lottery_code,
            universe_size=payload.universe_size,
            drawn_count=payload.drawn_count,
            min_numbers_to_choose=eff_min,
            max_numbers_to_choose=eff_max,
            prize_tiers=prize_tier_dicts,
            simple_bet_price_cents=payload.simple_bet_price_cents,
            price_updated_at=payload.price_updated_at,
            price_source=payload.price_source,
            strategies=[s.model_dump() for s in payload.strategies],
        )
    except UnregisteredLotteryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
