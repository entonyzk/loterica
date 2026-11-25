"""
Suíte de testes automatizados (pytest) do Motor Matemático Python — LOTUS AI.

Cobertura obrigatória:
1. Combinações exatas
2. Distribuição hipergeométrica
3. Probabilidades muito pequenas
4. Eventos impossíveis
5. Parâmetros inválidos
6. Soma da distribuição igual a 1
7. Comparação com valores matemáticos de referência
8. Contratos da API FastAPI
"""

from decimal import Decimal
from fractions import Fraction
import pytest

from app.core.axioms import (
    DISTRIBUTION_SUM_TOLERANCE,
    exact_combination_count,
    hypergeometric_hit_detail,
    hypergeometric_hit_probability,
    theoretical_distribution_detailed,
    theoretical_distribution_summary,
)


def test_exact_combinations_reference_values():
    assert exact_combination_count(60, 6) == 50_063_860
    assert exact_combination_count(25, 15) == 3_268_760
    assert exact_combination_count(80, 5) == 24_040_016
    assert exact_combination_count(100, 20) == 535_983_370_403_809_682_970


def test_hypergeometric_distribution_reference_comparisons():
    # Comparação exata com Fraction(C(k, h) * C(N-k, m-h), C(N, m))
    # Caso Mega-Sena (60, 6, 6)
    sena = hypergeometric_hit_detail(60, 6, 6, 6)
    assert sena["exact_numerator"] == "1"
    assert sena["exact_denominator"] == "50063860"
    assert sena["raw_numerator"] == "1"
    assert sena["raw_denominator"] == "50063860"

    quadra = hypergeometric_hit_detail(60, 6, 6, 4)
    # C(6,4) * C(54,2) = 15 * 1431 = 21465
    expected_quadra = Fraction(21465, 50_063_860)
    assert quadra["raw_numerator"] == "21465"
    assert quadra["exact_numerator"] == str(expected_quadra.numerator)
    assert quadra["exact_denominator"] == str(expected_quadra.denominator)
    assert quadra["probability"] == pytest.approx(float(expected_quadra), rel=1e-12)


def test_very_small_probabilities_no_silent_truncation():
    detail = hypergeometric_hit_detail(100, 20, 20, 20)
    assert detail["is_impossible"] is False
    assert detail["exact_numerator"] == "1"
    assert detail["exact_denominator"] == "535983370403809682970"
    assert detail["probability"] > 0.0
    assert detail["scientific_notation"].startswith("1.8657")
    assert detail["precision_classification"] == "exact_rational_with_float_approximation"


def test_impossible_events_are_exact_zero():
    # Em (25, 15, 15), h=4 é impossível pois C(10, 11) = 0
    low = hypergeometric_hit_detail(25, 15, 15, 4)
    assert low["is_impossible"] is True
    assert low["probability"] == 0.0
    assert low["exact_numerator"] == "0"
    assert low["precision_classification"] == "exact"

    high = hypergeometric_hit_detail(60, 6, 6, 7)
    assert high["is_impossible"] is True
    assert high["probability"] == 0.0


@pytest.mark.parametrize(
    "bad_args",
    [
        (0, 0),
        (5, 8),
        (10, -1),
        (60.5, 6),
        (True, 1),
    ],
)
def test_invalid_combinatorial_parameters_raise(bad_args):
    with pytest.raises(ValueError):
        exact_combination_count(*bad_args)


def test_invalid_hypergeometric_parameters_raise():
    with pytest.raises(ValueError):
        hypergeometric_hit_probability(60, 61, 6, 6)
    with pytest.raises(ValueError):
        hypergeometric_hit_probability(60, 6, -1, 0)
    with pytest.raises(ValueError):
        hypergeometric_hit_probability(60, 6, 6, 3.5)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "params",
    [
        (60, 6, 6),
        (25, 15, 15),
        (80, 5, 5),
        (50, 5, 7),
    ],
)
def test_distribution_sum_equals_one_exact_and_float(params):
    n, k, m = params
    summary = theoretical_distribution_summary(n, k, m)
    float_sum = sum(summary.values())
    assert abs(float_sum - 1.0) <= DISTRIBUTION_SUM_TOLERANCE

    detailed = theoretical_distribution_detailed(n, k, m)
    exact_fraction_sum = sum(
        Fraction(int(d["exact_numerator"]), int(d["exact_denominator"]))
        for d in detailed.values()
    )
    assert exact_fraction_sum == Fraction(1, 1)

    decimal_sum = sum(
        Decimal(d["exact_numerator"]) / Decimal(d["exact_denominator"])
        for d in detailed.values()
    )
    assert abs(decimal_sum - Decimal(1)) < Decimal("1e-50")


def test_fastapi_contracts():
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    from app.main import app

    client = fastapi_testclient.TestClient(app)

    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["execution_source"] == "python_fastapi_engine"

    ok_res = client.post(
        "/v1/probabilities/theoretical",
        json={
            "lottery_code": "mega-sena",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 6,
        },
    )
    assert ok_res.status_code == 200
    body = ok_res.json()
    assert body["lottery_code"] == "mega-sena"
    assert body["universe_size"] == 60
    assert body["drawn_count"] == 6
    assert body["chosen_count"] == 6
    assert body["total_combinations"] == "50063860"
    assert body["execution_source"] == "python_fastapi_engine"
    assert abs(body["distribution_sum"] - 1.0) <= body["distribution_sum_tolerance"]

    bad_res = client.post(
        "/v1/probabilities/theoretical",
        json={
            "lottery_code": "mega-sena",
            "universe_size": 10,
            "drawn_count": 15,
            "chosen_count": 5,
        },
    )
    assert bad_res.status_code == 422

    for invalid_payload in [
        {"lottery_code": "generic-reference", "universe_size": True, "drawn_count": 5, "chosen_count": 5},
        {"lottery_code": "generic-reference", "universe_size": 50, "drawn_count": False, "chosen_count": 5},
        {"lottery_code": "generic-reference", "universe_size": 60.0, "drawn_count": 6, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": 6.5, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": -1, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": 6, "chosen_count": -2},
        {"lottery_code": "generic-reference", "universe_size": 1001, "drawn_count": 6, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 0, "drawn_count": 0, "chosen_count": 0},
        {"lottery_code": "generic-reference", "universe_size": 50, "drawn_count": 5, "chosen_count": 51},
    ]:
        strict_res = client.post("/v1/probabilities/theoretical", json=invalid_payload)
        assert strict_res.status_code == 422


@pytest.mark.parametrize(
    "invalid_payload",
    [
        {"lottery_code": "generic-reference", "universe_size": True, "drawn_count": 5, "chosen_count": 5},
        {"lottery_code": "generic-reference", "universe_size": 50, "drawn_count": False, "chosen_count": 5},
        {"lottery_code": "generic-reference", "universe_size": 50, "drawn_count": 5, "chosen_count": True},
        {"lottery_code": "generic-reference", "universe_size": 60.0, "drawn_count": 6, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": 6.25, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": -60, "drawn_count": 6, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": -1, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 60, "drawn_count": 6, "chosen_count": -1},
        {"lottery_code": "generic-reference", "universe_size": 1001, "drawn_count": 6, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 20, "drawn_count": 21, "chosen_count": 6},
        {"lottery_code": "generic-reference", "universe_size": 20, "drawn_count": 6, "chosen_count": 21},
        {"lottery_code": "   ", "universe_size": 50, "drawn_count": 5, "chosen_count": 5},
        {"lottery_code": "generic-reference", "universe_size": 50, "drawn_count": 5, "chosen_count": 5, "extra": 1},
    ],
)
def test_pydantic_strict_validation_rejects_invalid_types_and_bounds(invalid_payload):
    pydantic = pytest.importorskip("pydantic")
    from app.core.contracts import TheoreticalProbabilityRequest

    with pytest.raises(pydantic.ValidationError):
        TheoreticalProbabilityRequest(**invalid_payload)


def test_specialized_mega_sena_and_lotofacil_models():
    from app.models import resolve_lottery_model

    mega = resolve_lottery_model("mega-sena", "hypergeometric_single_group")
    mega_tiers = [
        {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
        {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
        {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
    ]

    # Mega-Sena 7 dezenas (desdobramento: 7 jogos simples, R$ 42,00)
    res_mega7 = mega.compute_specialized(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=7,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=mega_tiers,
        simple_bet_price_cents=600,
        price_updated_at="2025-07-10T00:00:00.000Z",
        price_source="https://loterias.caixa.gov.br",
        simple_games_count=7,
    )
    assert res_mega7["multiple_bet"]["equivalent_simple_bets"] == "7"
    assert res_mega7["multiple_bet"]["total_cost_cents"] == "4200"
    assert res_mega7["distribution_by_hits"]["6"]["embedded_simple_wins"] == [
        {"tier_name": "Sena", "target_hits": 6, "winning_simple_combinations": "1"},
        {"tier_name": "Quina", "target_hits": 5, "winning_simple_combinations": "6"},
    ]
    any_f = Fraction(int(res_mega7["any_prize"]["exact_numerator"]), int(res_mega7["any_prize"]["exact_denominator"]))
    no_f = Fraction(int(res_mega7["no_prize"]["exact_numerator"]), int(res_mega7["no_prize"]["exact_denominator"]))
    assert any_f + no_f == Fraction(1, 1)

    # Lotofácil 16 dezenas (desdobramento: 16 jogos simples, R$ 56,00)
    loto = resolve_lottery_model("lotofacil", "hypergeometric_single_group")
    loto_tiers = [
        {"hits": h, "tier_name": f"{h} acertos", "tier_order": 16 - h, "is_main_prize": h == 15}
        for h in range(15, 10, -1)
    ]
    res_loto16 = loto.compute_specialized(
        lottery_code="lotofacil",
        universe_size=25,
        drawn_count=15,
        chosen_count=16,
        min_numbers_to_choose=15,
        max_numbers_to_choose=20,
        prize_tiers=loto_tiers,
        simple_bet_price_cents=350,
        price_updated_at="2025-07-09T00:00:00.000Z",
        price_source="https://loterias.caixa.gov.br",
        simple_games_count=16,
    )
    assert res_loto16["multiple_bet"]["equivalent_simple_bets"] == "16"
    assert res_loto16["multiple_bet"]["total_cost_cents"] == "5600"
    assert res_loto16["distribution_by_hits"]["5"]["is_impossible"] is True
    assert res_loto16["distribution_by_hits"]["5"]["probability"] == 0.0
    loto_any = Fraction(int(res_loto16["any_prize"]["exact_numerator"]), int(res_loto16["any_prize"]["exact_denominator"]))
    loto_no = Fraction(int(res_loto16["no_prize"]["exact_numerator"]), int(res_loto16["no_prize"]["exact_denominator"]))
    assert loto_any + loto_no == Fraction(1, 1)


def test_fastapi_specialized_endpoints():
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    from app.main import app

    client = fastapi_testclient.TestClient(app)

    models_res = client.get("/v1/models")
    assert models_res.status_code == 200
    model_types = {m["model_type"] for m in models_res.json()["models"]}
    assert {"hypergeometric_single_group", "positional_columns", "multi_extraction", "extra_field_combinatorial"}.issubset(model_types)

    spec_res = client.post(
        "/v1/probabilities/specialized",
        json={
            "lottery_code": "mega-sena",
            "math_model_type": "hypergeometric_single_group",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 20,
            "min_numbers_to_choose": 6,
            "max_numbers_to_choose": 20,
            "prize_tiers": [
                {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
                {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
                {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
            ],
            "simple_bet_price_cents": 600,
        },
    )
    assert spec_res.status_code == 200
    body = spec_res.json()
    assert body["multiple_bet"]["equivalent_simple_bets"] == "38760"
    assert body["multiple_bet"]["total_cost_cents"] == "23256000"

    unimplemented = client.post(
        "/v1/probabilities/specialized",
        json={
            "lottery_code": "super-sete",
            "math_model_type": "positional_columns",
            "universe_size": 10,
            "drawn_count": 7,
            "chosen_count": 7,
        },
    )
    assert unimplemented.status_code == 501

    unknown_res = client.post(
        "/v1/probabilities/specialized",
        json={
            "lottery_code": "loteria-inexistente",
            "math_model_type": "hypergeometric_single_group",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 6,
        },
    )
    assert unknown_res.status_code == 404

    generic_res = client.post(
        "/v1/probabilities/specialized",
        json={
            "lottery_code": "generic-reference",
            "math_model_type": "hypergeometric_single_group",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 6,
        },
    )
    assert generic_res.status_code == 422

    incompatible_model_res = client.post(
        "/v1/probabilities/specialized",
        json={
            "lottery_code": "mega-sena",
            "math_model_type": "positional_columns",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 6,
        },
    )
    assert incompatible_model_res.status_code == 422


def test_specialized_at_least_one_win_and_multiple_bets():
    from app.models import resolve_lottery_model

    mega = resolve_lottery_model("mega-sena", "hypergeometric_single_group")
    mega_tiers = [
        {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
        {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
        {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
    ]
    res_mega7 = mega.compute_specialized(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=7,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=mega_tiers,
        simple_bet_price_cents=600,
        price_updated_at=None,
        price_source=None,
        simple_games_count=7,
    )
    quina_tier = next(t for t in res_mega7["prize_tiers"] if t["hits"] == 5)
    assert quina_tier["at_least_one_win"]["triggering_volante_hits"] == [5, 6]
    raw_h5 = int(res_mega7["distribution_by_hits"]["5"]["raw_numerator"])
    raw_h6 = int(res_mega7["distribution_by_hits"]["6"]["raw_numerator"])
    assert int(quina_tier["at_least_one_win"]["raw_numerator"]) == raw_h5 + raw_h6
    assert quina_tier["expected_embedded_wins_per_draw"] == pytest.approx(7 * (324 / 50_063_860), rel=1e-12)

    loto = resolve_lottery_model("lotofacil", "hypergeometric_single_group")
    loto_tiers = [
        {"hits": h, "tier_name": f"{h} acertos", "tier_order": 16 - h, "is_main_prize": h == 15}
        for h in range(15, 10, -1)
    ]
    res_loto16 = loto.compute_specialized(
        lottery_code="lotofacil",
        universe_size=25,
        drawn_count=15,
        chosen_count=16,
        min_numbers_to_choose=15,
        max_numbers_to_choose=20,
        prize_tiers=loto_tiers,
        simple_bet_price_cents=350,
        price_updated_at=None,
        price_source=None,
        simple_games_count=16,
    )
    t14 = next(t for t in res_loto16["prize_tiers"] if t["hits"] == 14)
    assert t14["at_least_one_win"]["triggering_volante_hits"] == [14, 15]
    assert int(t14["at_least_one_win"]["raw_numerator"]) == (
        int(res_loto16["distribution_by_hits"]["14"]["raw_numerator"])
        + int(res_loto16["distribution_by_hits"]["15"]["raw_numerator"])
    )


def test_specialized_exact_union_and_overlap_comparison():
    from app.models import resolve_lottery_model

    mega = resolve_lottery_model("mega-sena", "hypergeometric_single_group")
    mega_tiers = [
        {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
        {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
        {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
    ]

    # Sem apostas explícitas -> status exige combinações, aproximação marcada is_exact=False
    without_bets = mega.compute_specialized(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=mega_tiers,
        simple_bet_price_cents=600,
        price_updated_at=None,
        price_source=None,
        simple_games_count=2,
    )
    assert without_bets["simple_games_comparison"]["secondary_prize_status"] == "requires_explicit_combinations"
    assert without_bets["simple_games_comparison"]["exact_union_analysis"] is None
    assert without_bets["simple_games_comparison"]["illustrative_independent_approximation"]["is_exact"] is False

    # 2 jogos disjuntos vs 2 jogos com 5 dezenas em comum
    disjoint = mega.compute_specialized(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=mega_tiers,
        simple_bet_price_cents=600,
        price_updated_at=None,
        price_source=None,
        simple_games_count=2,
        simple_bets=[[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
    )
    high_overlap = mega.compute_specialized(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=mega_tiers,
        simple_bet_price_cents=600,
        price_updated_at=None,
        price_source=None,
        simple_games_count=2,
        simple_bets=[[1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 7]],
    )
    u_dis = disjoint["simple_games_comparison"]["exact_union_analysis"]
    u_ovl = high_overlap["simple_games_comparison"]["exact_union_analysis"]
    assert u_dis["pairwise_overlap_summary"]["disjoint_pairs_count"] == 1
    assert u_ovl["pairwise_overlap_summary"]["min_overlap"] == 5
    assert u_dis["main_prize_union"]["raw_numerator"] == "2"
    assert u_ovl["main_prize_union"]["raw_numerator"] == "2"
    assert int(u_dis["secondary_prize_union"]["raw_numerator"]) > int(u_ovl["secondary_prize_union"]["raw_numerator"])
    assert int(u_dis["any_prize_union"]["raw_numerator"]) > int(u_ovl["any_prize_union"]["raw_numerator"])


def test_registry_validation_rejects_unknown_and_mismatched_modalities():
    from app.models.registry import UnregisteredLotteryError, validate_specialized_lottery_params

    with pytest.raises(UnregisteredLotteryError):
        validate_specialized_lottery_params(
            lottery_code="nao-existe",
            math_model_type="hypergeometric_single_group",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=[{"hits": 6}],
        )

    with pytest.raises(ValueError):
        validate_specialized_lottery_params(
            lottery_code="mega-sena",
            math_model_type="hypergeometric_single_group",
            universe_size=50,
            drawn_count=6,
            chosen_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=[{"hits": 6}],
        )


def test_etapa3_constrained_universe_and_budget_exact():
    from math import comb
    from app.combinations import analyze_constrained_universe

    # Mega-Sena: 60 números, aposta de 6, 2 fixos, 10 excluídos -> C(48, 4) = 194.580
    res = analyze_constrained_universe(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        fixed_numbers=[1, 2],
        excluded_numbers=[51, 52, 53, 54, 55, 56, 57, 58, 59, 60],
        desired_games_count=20,
        max_budget_cents=7500,  # R$ 75,00 -> cabe 12 apostas de R$ 6,00
        simple_bet_price_cents=600,
        price_updated_at="2025-07-10T00:00:00.000Z",
        price_source="CAIXA",
    )
    assert res["combinatorics"]["total_unrestricted_combinations"] == str(comb(60, 6))
    assert res["combinatorics"]["restricted_combinations"] == str(comb(48, 4))
    assert res["budget_and_costs"]["affordable_games_count"] == "12"
    assert res["budget_and_costs"]["planned_games_count"] == "12"
    assert res["budget_and_costs"]["planned_total_cost_cents"] == "7200"
    assert res["budget_and_costs"]["remaining_budget_cents"] == "300"
    assert res["budget_and_costs"]["left_out_by_budget"] == "8"
    assert res["combinatorics"]["permutations_k_from_m"] == "720"


def test_etapa3_rejects_fixed_excluded_conflicts():
    from app.combinations import analyze_constrained_universe

    with pytest.raises(ValueError, match="Conflito"):
        analyze_constrained_universe(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            fixed_numbers=[10],
            excluded_numbers=[10],
        )

    with pytest.raises(ValueError, match="excede"):
        analyze_constrained_universe(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            fixed_numbers=[1, 2, 3, 4, 5, 6, 7],
            excluded_numbers=[],
        )


def test_etapa3_bet_set_analysis_and_exact_coverage():
    from math import comb
    from app.combinations import analyze_bet_set, analyze_subset_coverage

    bets = [
        [1, 2, 3, 4, 5, 6],
        [1, 2, 3, 4, 5, 6],  # repetida
        [1, 2, 7, 8, 9, 10],
    ]
    analysis = analyze_bet_set(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        bets=bets,
        fixed_numbers=[1, 2],
        excluded_numbers=[60],
        simple_bet_price_cents=600,
    )
    assert analysis["counts"]["submitted_bets_count"] == 3
    assert analysis["counts"]["distinct_bets_count"] == 2
    assert analysis["counts"]["repeated_bets_count"] == 1
    assert analysis["costs"]["wasted_on_duplicates_cents"] == "600"
    assert analysis["intersections"]["distinct_pair_count"] == 1
    assert analysis["intersections"]["min_overlap"] == 2
    assert analysis["redundancy"]["distinct_simple_combinations"] == "2"

    # Cobertura de pares (t=2) sobre pool pequeno de 6 números {1..6}
    # 1 aposta [1,2,3,4,5,6] cobre C(6,2)=15 de 15 pares -> 100% comprovada
    cov_full = analyze_subset_coverage(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        bets=[[1, 2, 3, 4, 5, 6]],
        target_subset_size=2,
        pool_numbers=[1, 2, 3, 4, 5, 6],
    )
    assert cov_full["coverage"]["is_full_coverage_proven"] is True
    assert cov_full["coverage"]["uncovered_subsets_count"] == "0"
    assert cov_full["coverage"]["coverage_fraction"] == "1 / 1"

    # Pool de 7 números {1..7} com 1 aposta [1..6] -> faltam 6 pares com o 7 -> não pode afirmar 100%
    cov_partial = analyze_subset_coverage(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        bets=[[1, 2, 3, 4, 5, 6]],
        target_subset_size=2,
        pool_numbers=[1, 2, 3, 4, 5, 6, 7],
    )
    assert cov_partial["coverage"]["is_full_coverage_proven"] is False
    assert cov_partial["coverage"]["covered_subsets_count"] == str(comb(6, 2))
    assert cov_partial["coverage"]["uncovered_subsets_count"] == str(comb(7, 2) - comb(6, 2))
    assert len(cov_partial["uncovered_sample"]) == 6


def test_etapa3_controlled_generator_zero_duplicates_and_methods():
    from app.combinations import generate_controlled_bets

    # Enumeração exaustiva em espaço pequeno: 4 fixos e 4 livres -> C(4, 2) = 6 combinações
    exh = generate_controlled_bets(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        fixed_numbers=[1, 2, 3, 4],
        excluded_numbers=list(range(9, 61)),
        desired_games_count=10,
        method="exhaustive",
        simple_bet_price_cents=600,
    )
    assert exh["generation_summary"]["generated_count"] == 6
    assert exh["generation_summary"]["duplicates_count"] == 0
    assert exh["method_classification"]["is_exact_solution"] is True
    assert all(set([1, 2, 3, 4]).issubset(b) for b in exh["generated_bets"])

    # Heurística gulosa + orçamento limitado a R$ 30,00 (5 apostas) + filtros
    heur = generate_controlled_bets(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        chosen_count=6,
        fixed_numbers=[10],
        excluded_numbers=[1, 2],
        desired_games_count=12,
        method="combinatorial_search",
        coverage_target_t=2,
        seed=42,
        max_budget_cents=3000,
        simple_bet_price_cents=600,
        min_even=2,
        max_even=4,
    )
    assert heur["generation_summary"]["generated_count"] == 5
    assert heur["generation_summary"]["duplicates_count"] == 0
    assert heur["method_classification"]["is_exact_solution"] is False
    assert heur["method_classification"]["is_proven_optimal_covering"] is False
    for bet in heur["generated_bets"]:
        assert 10 in bet
        assert 1 not in bet and 2 not in bet
        evens = sum(1 for n in bet if n % 2 == 0)
        assert 2 <= evens <= 4


def test_etapa3_compare_strategies_and_fastapi_endpoints():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    compare_payload = {
        "lottery_code": "mega-sena",
        "math_model_type": "hypergeometric_single_group",
        "universe_size": 60,
        "drawn_count": 6,
        "min_numbers_to_choose": 6,
        "max_numbers_to_choose": 20,
        "prize_tiers": [
            {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
            {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
            {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
        ],
        "simple_bet_price_cents": 600,
        "strategies": [
            {
                "name": "Amostragem 6d",
                "chosen_count": 6,
                "desired_games_count": 5,
                "method": "uniform_sampling",
                "coverage_target_t": 2,
                "seed": 11,
            },
            {
                "name": "Heurística 6d",
                "chosen_count": 6,
                "desired_games_count": 5,
                "method": "coverage_heuristic",
                "coverage_target_t": 2,
                "seed": 11,
            },
        ],
    }

    resp = client.post("/v1/combinations/compare", json=compare_payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["strategies_count"] == 2
    assert body["has_heterogeneous_universes"] is False
    assert body["strategies"][0]["total_cost_cents"] == "3000"
    assert body["strategies"][0]["restrictions"]["pool_size"] == 60
    assert body["strategies"][1]["coverage_comparable_with_baseline"] is True
    assert body["strategies"][1]["delta_vs_baseline"]["cost_cents"] == "0"
    assert body["strategies"][0]["probabilities"]["exact_union_status"] == "exact_union_computed"


MEGA_TIERS_REF = [
    {"hits": 6, "tier_name": "Sena", "tier_order": 1, "is_main_prize": True},
    {"hits": 5, "tier_name": "Quina", "tier_order": 2, "is_main_prize": False},
    {"hits": 4, "tier_name": "Quadra", "tier_order": 3, "is_main_prize": False},
]


def test_etapa3_audit_01_rejects_bet_with_excluded_number():
    from app.combinations import analyze_bet_set

    with pytest.raises(ValueError, match="excluídas"):
        analyze_bet_set(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 60]],
            fixed_numbers=[1],
            excluded_numbers=[60],
        )


def test_etapa3_audit_02_rejects_bet_missing_required_fixed_number():
    from app.combinations import analyze_bet_set

    with pytest.raises(ValueError, match="fixas obrigatórias"):
        analyze_bet_set(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[2, 3, 4, 5, 6, 7]],
            fixed_numbers=[1],
            excluded_numbers=[60],
        )


def test_etapa3_audit_03_rejects_bet_with_repeated_numbers():
    from app.combinations import analyze_bet_set, analyze_subset_coverage

    with pytest.raises(ValueError, match="repetidas"):
        analyze_bet_set(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 5]],
        )

    with pytest.raises(ValueError, match="repetidas"):
        analyze_subset_coverage(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 5]],
            target_subset_size=2,
        )


def test_etapa3_audit_04_rejects_bet_with_number_out_of_universe():
    from app.combinations import analyze_bet_set, analyze_subset_coverage

    with pytest.raises(ValueError, match="fora do universo"):
        analyze_bet_set(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 61]],
        )

    with pytest.raises(ValueError, match="fora do universo"):
        analyze_subset_coverage(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[0, 2, 3, 4, 5, 6]],
            target_subset_size=2,
        )


def test_etapa3_audit_05_rejects_bet_with_wrong_number_count():
    from app.combinations import analyze_bet_set, analyze_subset_coverage

    with pytest.raises(ValueError, match="exatamente 6 dezenas"):
        analyze_bet_set(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5]],
        )

    with pytest.raises(ValueError, match="exatamente 6 dezenas"):
        analyze_subset_coverage(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 6, 7]],
            target_subset_size=2,
        )


def test_etapa3_audit_06_coverage_rejects_invalid_and_incompatible_bets():
    from app.combinations import analyze_subset_coverage

    # Não deve ignorar silenciosamente número excluído presente na aposta
    with pytest.raises(ValueError, match="excluídas"):
        analyze_subset_coverage(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[1, 2, 3, 4, 5, 60]],
            target_subset_size=2,
            fixed_numbers=[1],
            excluded_numbers=[60],
        )

    # Deve rejeitar aposta sem fixo obrigatório
    with pytest.raises(ValueError, match="fixas obrigatórias"):
        analyze_subset_coverage(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            chosen_count=6,
            bets=[[2, 3, 4, 5, 6, 7]],
            target_subset_size=2,
            fixed_numbers=[1],
            excluded_numbers=[],
        )


def test_etapa3_audit_07_comparator_rejects_invalid_strategy():
    from app.combinations import compare_strategies

    # Estratégia explícita violando número excluído
    with pytest.raises(ValueError, match="excluídos"):
        compare_strategies(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=MEGA_TIERS_REF,
            simple_bet_price_cents=600,
            price_updated_at=None,
            price_source=None,
            strategies=[
                {
                    "name": "Explícita Inválida",
                    "chosen_count": 6,
                    "fixed_numbers": [1],
                    "excluded_numbers": [60],
                    "coverage_target_t": 2,
                    "bets": [[1, 2, 3, 4, 5, 60]],
                }
            ],
        )

    # Estratégia explícita sem número fixo
    with pytest.raises(ValueError, match="fixos obrigatórios"):
        compare_strategies(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=MEGA_TIERS_REF,
            simple_bet_price_cents=600,
            price_updated_at=None,
            price_source=None,
            strategies=[
                {
                    "name": "Sem Fixo",
                    "chosen_count": 6,
                    "fixed_numbers": [1, 2],
                    "excluded_numbers": [],
                    "coverage_target_t": 2,
                    "bets": [[3, 4, 5, 6, 7, 8]],
                }
            ],
        )


def test_etapa3_audit_08_comparator_rejects_explicit_strategy_over_budget():
    from app.combinations import compare_strategies

    # 2 apostas simples na Mega-Sena = 1200 centavos, teto = 600 centavos -> rejeição obrigatória
    with pytest.raises(ValueError, match="orçamento máximo"):
        compare_strategies(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=MEGA_TIERS_REF,
            simple_bet_price_cents=600,
            price_updated_at=None,
            price_source=None,
            strategies=[
                {
                    "name": "Explícita Acima do Orçamento",
                    "chosen_count": 6,
                    "fixed_numbers": [1],
                    "excluded_numbers": [60],
                    "coverage_target_t": 2,
                    "max_budget_cents": 600,
                    "bets": [
                        [1, 2, 3, 4, 5, 6],
                        [1, 7, 8, 9, 10, 11],
                    ],
                }
            ],
        )


def test_etapa3_audit_09_comparator_handles_heterogeneous_restriction_universes():
    from app.combinations import compare_strategies

    res = compare_strategies(
        lottery_code="mega-sena",
        universe_size=60,
        drawn_count=6,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        prize_tiers=MEGA_TIERS_REF,
        simple_bet_price_cents=600,
        price_updated_at=None,
        price_source=None,
        strategies=[
            {
                "name": "Universo Completo",
                "chosen_count": 6,
                "fixed_numbers": [],
                "excluded_numbers": [],
                "desired_games_count": 4,
                "method": "uniform_sampling",
                "coverage_target_t": 2,
                "seed": 10,
            },
            {
                "name": "Universo Restrito",
                "chosen_count": 6,
                "fixed_numbers": [1],
                "excluded_numbers": list(range(41, 61)),
                "desired_games_count": 4,
                "method": "coverage_heuristic",
                "coverage_target_t": 2,
                "seed": 10,
            },
        ],
    )
    assert res["has_heterogeneous_universes"] is True
    assert res["universe_comparison_notice"] is not None
    assert res["strategies"][0]["restrictions"]["pool_size"] == 60
    assert res["strategies"][1]["restrictions"]["pool_size"] == 40
    assert res["strategies"][0]["coverage_comparable_with_baseline"] is True
    assert res["strategies"][1]["coverage_comparable_with_baseline"] is False
    # Delta de cobertura em p.p. não deve ser computado de forma enganosa entre pools distintos
    assert res["strategies"][1]["delta_vs_baseline"]["coverage_percentage_points"] is None


def test_etapa3_audit_10_invalid_inputs_rejected_without_probability_computation(monkeypatch):
    from app.combinations import combinatorics_ops

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Cálculo de probabilidade não deveria ser executado para entrada inválida!")

    monkeypatch.setattr(combinatorics_ops, "_compute_exact_union_for_simple_bets", fail_if_called)

    # 1) Comparador inválido nunca alcança _compute_exact_union_for_simple_bets
    with pytest.raises(ValueError):
        combinatorics_ops.compare_strategies(
            lottery_code="mega-sena",
            universe_size=60,
            drawn_count=6,
            min_numbers_to_choose=6,
            max_numbers_to_choose=20,
            prize_tiers=MEGA_TIERS_REF,
            simple_bet_price_cents=600,
            price_updated_at=None,
            price_source=None,
            strategies=[
                {
                    "name": "Inválida",
                    "chosen_count": 6,
                    "fixed_numbers": [1],
                    "excluded_numbers": [60],
                    "bets": [[2, 3, 4, 5, 6, 60]],
                }
            ],
        )

    # 2) Endpoint FastAPI retorna 422 sem chaves de probabilidade ou cobertura válidas
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    from app.main import app

    client = fastapi_testclient.TestClient(app)
    cov_bad = client.post(
        "/v1/combinations/coverage",
        json={
            "lottery_code": "mega-sena",
            "math_model_type": "hypergeometric_single_group",
            "universe_size": 60,
            "drawn_count": 6,
            "chosen_count": 6,
            "bets": [[1, 2, 3, 4, 5, 60]],
            "target_subset_size": 2,
            "fixed_numbers": [1],
            "excluded_numbers": [60],
        },
    )
    assert cov_bad.status_code == 422
    assert "coverage" not in cov_bad.json()

    cmp_bad = client.post(
        "/v1/combinations/compare",
        json={
            "lottery_code": "mega-sena",
            "math_model_type": "hypergeometric_single_group",
            "universe_size": 60,
            "drawn_count": 6,
            "min_numbers_to_choose": 6,
            "max_numbers_to_choose": 20,
            "prize_tiers": MEGA_TIERS_REF,
            "simple_bet_price_cents": 600,
            "strategies": [
                {
                    "name": "Explícita acima do teto",
                    "chosen_count": 6,
                    "max_budget_cents": 600,
                    "bets": [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
                }
            ],
        },
    )
    assert cmp_bad.status_code == 422
    assert "strategies" not in cmp_bad.json()



