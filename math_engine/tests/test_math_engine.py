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

