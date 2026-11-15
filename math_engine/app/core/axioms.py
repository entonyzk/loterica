"""
Módulo de Axiomas e Probabilidade Teórica — LOTUS AI.

Regra fundamental:
Em sorteios justos e independentes, resultados anteriores não alteram
a probabilidade matemática dos próximos resultados.
"""

from decimal import Decimal, getcontext
from math import comb, gcd
from typing import Any, Dict

# Alta precisão decimal para evitar truncamento de probabilidades muito pequenas
getcontext().prec = 60

INDEPENDENCE_AXIOM_STATEMENT = (
    "Em sorteios justos e independentes, P(E_t | H_{t-1}) = P(E_t). "
    "Resultados históricos não alteram a probabilidade combinatória dos próximos sorteios."
)


def _validate_parameters(universe_size: int, drawn_count: int, chosen_count: int) -> None:
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in (universe_size, drawn_count, chosen_count)):
        raise ValueError("Todos os parâmetros devem ser inteiros válidos.")
    if universe_size < 1:
        raise ValueError("universe_size deve ser >= 1.")
    if drawn_count < 0 or drawn_count > universe_size:
        raise ValueError("drawn_count deve estar no intervalo [0, universe_size].")
    if chosen_count < 0 or chosen_count > universe_size:
        raise ValueError("chosen_count deve estar no intervalo [0, universe_size].")


def exact_combination_count(universe_size: int, chosen_count: int) -> int:
    """Calcula C(N, k) exato em aritmética inteira arbitrária."""
    if (
        not isinstance(universe_size, int)
        or isinstance(universe_size, bool)
        or not isinstance(chosen_count, int)
        or isinstance(chosen_count, bool)
    ):
        raise ValueError("Parâmetros combinatórios devem ser inteiros.")
    if universe_size < 1 or chosen_count < 0 or chosen_count > universe_size:
        raise ValueError("Parâmetros combinatórios inválidos.")
    return comb(universe_size, chosen_count)


def hypergeometric_hit_detail(
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    hits: int,
) -> Dict[str, Any]:
    """
    Calcula a fração racional exata P(X = h) = num / den e sua aproximação IEEE-754 / Decimal.
    """
    _validate_parameters(universe_size, drawn_count, chosen_count)
    if not isinstance(hits, int) or isinstance(hits, bool):
        raise ValueError("hits deve ser um inteiro.")

    if hits < 0 or hits > min(drawn_count, chosen_count) or (chosen_count - hits) > (universe_size - drawn_count):
        return {
            "hits": hits,
            "probability": 0.0,
            "exact_numerator": "0",
            "exact_denominator": "1",
            "scientific_notation": "0",
            "is_impossible": True,
            "precision_classification": "exact",
        }

    favorable = comb(drawn_count, hits) * comb(universe_size - drawn_count, chosen_count - hits)
    total = comb(universe_size, chosen_count)
    divisor = gcd(favorable, total)
    num = favorable // divisor
    den = total // divisor

    dec_val = Decimal(num) / Decimal(den)
    prob_float = float(dec_val)
    precision_class = "exact" if num == den else "exact_rational_with_float_approximation"

    return {
        "hits": hits,
        "probability": prob_float,
        "exact_numerator": str(num),
        "exact_denominator": str(den),
        "scientific_notation": f"{dec_val:.8E}",
        "is_impossible": False,
        "precision_classification": precision_class,
    }


def hypergeometric_hit_probability(
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    hits: int,
) -> float:
    return float(hypergeometric_hit_detail(universe_size, drawn_count, chosen_count, hits)["probability"])


def theoretical_distribution_summary(
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
) -> Dict[int, float]:
    _validate_parameters(universe_size, drawn_count, chosen_count)
    max_hits = min(drawn_count, chosen_count)
    return {
        h: hypergeometric_hit_probability(universe_size, drawn_count, chosen_count, h)
        for h in range(0, max_hits + 1)
    }


def theoretical_distribution_detailed(
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
) -> Dict[int, Dict[str, Any]]:
    _validate_parameters(universe_size, drawn_count, chosen_count)
    max_hits = min(drawn_count, chosen_count)
    return {
        h: hypergeometric_hit_detail(universe_size, drawn_count, chosen_count, h)
        for h in range(0, max_hits + 1)
    }
