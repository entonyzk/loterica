"""Sistema de estudo exato de cobertura de subconjuntos para conjuntos de apostas."""

from collections import Counter
from decimal import Decimal, getcontext
from fractions import Fraction
from itertools import combinations
from math import comb
import random
from typing import Any, Dict, List, Optional, Sequence, Tuple

getcontext().prec = 60

MAX_EXHAUSTIVE_POOL_ENUM = 250_000
MAX_BET_EXPANSION_OPS = 400_000

COVERAGE_VS_GUARANTEE_NOTICE = (
    "Cobertura combinatória de t-subconjuntos mede exclusivamente quantos subconjuntos de tamanho t "
    "do grupo ativo P aparecem contidos em ao menos uma aposta do conjunto. "
    "Cobertura de subconjuntos NÃO equivale a garantia de premiação: um prêmio só ocorre se as dezenas "
    "sorteadas coincidirem com o subgrupo nas condições exigidas, e sorteios futuros permanecem independentes."
)


def _format_pct(frac: Fraction) -> float:
    if frac.numerator == 0:
        return 0.0
    if frac.numerator == frac.denominator:
        return 100.0
    return float((Decimal(frac.numerator) * Decimal(100)) / Decimal(frac.denominator))


def analyze_subset_coverage(
    *,
    lottery_code: str,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    bets: Sequence[Sequence[int]],
    target_subset_size: int,
    pool_numbers: Optional[Sequence[int]] = None,
) -> Dict[str, Any]:
    """
    Analisa a cobertura exata de subconjuntos de tamanho t (`target_subset_size`) sobre um pool ativo P.
    Nunca afirma cobertura integral (100%) sem comprovação exata (`uncovered == 0`).
    """
    if not bets:
        raise ValueError("Informe ao menos 1 aposta para estudar a cobertura.")
    if len(bets) > 500:
        raise ValueError("Limite de 500 apostas por estudo de cobertura.")
    if target_subset_size < 1 or target_subset_size > min(chosen_count, drawn_count):
        raise ValueError(
            f"target_subset_size={target_subset_size} deve estar entre 1 e min(chosen_count, drawn_count)={min(chosen_count, drawn_count)}."
        )

    if pool_numbers is not None:
        pool = sorted(set(pool_numbers))
        if len(pool) != len(pool_numbers):
            raise ValueError("pool_numbers contém dezenas duplicadas.")
        for n in pool:
            if n < 1 or n > universe_size:
                raise ValueError(f"Dezena {n} em pool_numbers fora do universo [1..{universe_size}].")
    else:
        pool = list(range(1, universe_size + 1))

    if len(pool) < target_subset_size:
        raise ValueError(
            f"O pool selecionado ({len(pool)} dezenas) é menor que target_subset_size={target_subset_size}."
        )

    pool_set = set(pool)
    normalized_bets: List[Tuple[int, ...]] = []
    for idx, b in enumerate(bets):
        if len(b) != chosen_count:
            raise ValueError(f"Aposta #{idx + 1} deve ter {chosen_count} dezenas.")
        uniq = sorted(set(b))
        if len(uniq) != chosen_count:
            raise ValueError(f"Aposta #{idx + 1} possui dezenas repetidas.")
        for n in uniq:
            if n < 1 or n > universe_size:
                raise ValueError(f"Dezena {n} fora do universo [1..{universe_size}].")
        normalized_bets.append(tuple(uniq))

    freq_bets = Counter(normalized_bets)
    distinct_bets = list(freq_bets.keys())

    total_pool_subsets = comb(len(pool), target_subset_size)
    total_universe_subsets = comb(universe_size, target_subset_size)
    subsets_per_bet = comb(chosen_count, target_subset_size)
    nominal_appearances = len(normalized_bets) * subsets_per_bet

    if len(distinct_bets) * subsets_per_bet > MAX_BET_EXPANSION_OPS:
        raise ValueError(
            f"Expansão combinatória ({len(distinct_bets)} apostas x C({chosen_count},{target_subset_size}) = "
            f"{len(distinct_bets) * subsets_per_bet}) excede o limite de processamento exato ({MAX_BET_EXPANSION_OPS}). "
            "Reduza a quantidade de apostas ou o tamanho de t."
        )

    subset_hits: Counter[Tuple[int, ...]] = Counter()
    for bet in normalized_bets:
        bet_in_pool = [n for n in bet if n in pool_set]
        if len(bet_in_pool) >= target_subset_size:
            for sub in combinations(bet_in_pool, target_subset_size):
                subset_hits[sub] += 1

    covered_count = len(subset_hits)
    uncovered_count = total_pool_subsets - covered_count
    repeated_appearances = sum(subset_hits.values()) - covered_count

    cov_frac = Fraction(covered_count, total_pool_subsets)
    cov_pct = _format_pct(cov_frac)
    univ_frac = Fraction(covered_count, total_universe_subsets)
    univ_pct = _format_pct(univ_frac)

    multiplicity_hist = Counter(subset_hits.values())
    if uncovered_count > 0:
        multiplicity_hist[0] = uncovered_count

    covered_sample = [
        {"subset": list(sub), "occurrences": occ}
        for sub, occ in sorted(subset_hits.items(), key=lambda x: (-x[1], x[0]))[:30]
    ]

    uncovered_sample: List[List[int]] = []
    if uncovered_count == 0:
        uncovered_mode = "exhaustive"
    elif total_pool_subsets <= MAX_EXHAUSTIVE_POOL_ENUM:
        uncovered_mode = "exhaustive"
        for sub in combinations(pool, target_subset_size):
            if sub not in subset_hits:
                uncovered_sample.append(list(sub))
                if len(uncovered_sample) >= 40:
                    break
    else:
        uncovered_mode = "sampled_missing"
        rng = random.Random(1337)
        attempts = 0
        seen_sample = set()
        while len(uncovered_sample) < 30 and attempts < 4000:
            attempts += 1
            cand = tuple(sorted(rng.sample(pool, target_subset_size)))
            if cand not in subset_hits and cand not in seen_sample:
                seen_sample.add(cand)
                uncovered_sample.append(list(cand))

    is_full_coverage_proven = uncovered_count == 0

    return {
        "lottery_code": lottery_code,
        "universe_size": universe_size,
        "drawn_count": drawn_count,
        "chosen_count": chosen_count,
        "target_subset_size": target_subset_size,
        "pool_size": len(pool),
        "pool_numbers": pool,
        "submitted_bets_count": len(normalized_bets),
        "distinct_bets_count": len(distinct_bets),
        "coverage": {
            "total_pool_subsets": str(total_pool_subsets),
            "total_universe_subsets": str(total_universe_subsets),
            "covered_subsets_count": str(covered_count),
            "uncovered_subsets_count": str(uncovered_count),
            "coverage_fraction": f"{cov_frac.numerator} / {cov_frac.denominator}",
            "coverage_exact_numerator": str(cov_frac.numerator),
            "coverage_exact_denominator": str(cov_frac.denominator),
            "coverage_percentage": round(cov_pct, 6),
            "universe_coverage_percentage": round(univ_pct, 6),
            "is_full_coverage_proven": is_full_coverage_proven,
            "enumeration_mode": uncovered_mode,
        },
        "redundancy": {
            "subsets_per_bet": str(subsets_per_bet),
            "nominal_subset_appearances": str(nominal_appearances),
            "repeated_subset_appearances": str(repeated_appearances),
            "multiplicity_histogram": {
                str(k): v for k, v in sorted(multiplicity_hist.items())
            },
        },
        "covered_sample": covered_sample,
        "uncovered_sample": uncovered_sample,
        "coverage_vs_guarantee_notice": COVERAGE_VS_GUARANTEE_NOTICE,
        "execution_source": "python_fastapi_engine",
    }
