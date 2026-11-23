"""Operações combinatórias exatas, restrições de fixos/excluídos, análise de conjuntos e comparador."""

from collections import Counter
from decimal import Decimal, getcontext
from fractions import Fraction
from itertools import combinations
from math import comb, factorial, perm
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..models.hypergeometric import _compute_exact_union_for_simple_bets
from .coverage import analyze_subset_coverage
from .generator import generate_controlled_bets

getcontext().prec = 60

NO_PREDICTION_NOTICE = (
    "Análise combinatória exata sob independência dos sorteios. "
    "Restrições de fixos/excluídos reduzem o universo de apostas selecionadas pelo usuário, "
    "sem tornar nenhuma dezena individual mais provável que outra no sorteio oficial."
)


def _format_decimal_pct(frac: Fraction) -> str:
    if frac.numerator == 0:
        return "0%"
    if frac.numerator == frac.denominator:
        return "100%"
    val = (Decimal(frac.numerator) * Decimal(100)) / Decimal(frac.denominator)
    return f"{val:.6g}%"


def _format_decimal_sci(frac: Fraction) -> str:
    if frac.numerator == 0:
        return "0"
    if frac.numerator == frac.denominator:
        return "1"
    val = Decimal(frac.numerator) / Decimal(frac.denominator)
    return f"{val:.8E}"


def _rounded_odds_one_in(frac: Fraction) -> Optional[str]:
    if frac.numerator <= 0:
        return None
    return str((frac.denominator + frac.numerator // 2) // frac.numerator)


def validate_and_partition_constraints(
    *,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    fixed_numbers: Sequence[int],
    excluded_numbers: Sequence[int],
    variable_numbers: Optional[Sequence[int]] = None,
) -> Dict[str, Any]:
    """Valida e particiona U={1..N} em Fixos (F), Excluídos (E) e Livres/Variáveis (V)."""
    fixed_set = sorted(set(fixed_numbers))
    excluded_set = sorted(set(excluded_numbers))

    if len(fixed_set) != len(fixed_numbers):
        raise ValueError("fixed_numbers contém dezenas duplicadas.")
    if len(excluded_set) != len(excluded_numbers):
        raise ValueError("excluded_numbers contém dezenas duplicadas.")

    for n in fixed_set:
        if n < 1 or n > universe_size:
            raise ValueError(f"Dezena fixa {n} fora do universo [1..{universe_size}].")
    for n in excluded_set:
        if n < 1 or n > universe_size:
            raise ValueError(f"Dezena excluída {n} fora do universo [1..{universe_size}].")

    overlap = sorted(set(fixed_set).intersection(excluded_set))
    if overlap:
        raise ValueError(
            f"Conflito entre números fixos e excluídos: dezenas {overlap} não podem ser simultaneamente obrigatórias e excluídas."
        )

    if variable_numbers is not None:
        var_clean = sorted(set(variable_numbers))
        if len(var_clean) != len(variable_numbers):
            raise ValueError("variable_numbers contém dezenas duplicadas.")
        for n in var_clean:
            if n < 1 or n > universe_size:
                raise ValueError(f"Dezena livre {n} fora do universo [1..{universe_size}].")
            if n in fixed_set or n in excluded_set:
                raise ValueError(
                    f"Dezena {n} em variable_numbers conflita com fixed_numbers ou excluded_numbers."
                )
        # Qualquer número fora de F ∪ V funciona efetivamente como excluído do espaço operacional
        effective_excluded = sorted(
            set(range(1, universe_size + 1)) - set(fixed_set) - set(var_clean)
        )
        effective_variable = var_clean
    else:
        effective_excluded = excluded_set
        effective_variable = sorted(
            set(range(1, universe_size + 1)) - set(fixed_set) - set(excluded_set)
        )

    f = len(fixed_set)
    v = len(effective_variable)
    e = len(effective_excluded)

    if f > chosen_count:
        raise ValueError(
            f"Quantidade de números fixos ({f}) excede o tamanho da aposta ({chosen_count} dezenas)."
        )
    if f + v < chosen_count:
        raise ValueError(
            f"Dezenas disponíveis insuficientes ({f} fixos + {v} livres = {f + v}) para formar aposta de {chosen_count} dezenas."
        )
    if drawn_count > universe_size:
        raise ValueError("drawn_count deve ser <= universe_size.")

    return {
        "fixed_numbers": fixed_set,
        "excluded_numbers": effective_excluded,
        "explicit_excluded_numbers": excluded_set,
        "variable_numbers": effective_variable,
        "fixed_count": f,
        "excluded_count": e,
        "variable_count": v,
        "remaining_slots": chosen_count - f,
    }


def analyze_constrained_universe(
    *,
    lottery_code: str,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    fixed_numbers: Sequence[int],
    excluded_numbers: Sequence[int],
    variable_numbers: Optional[Sequence[int]] = None,
    desired_games_count: int = 1,
    max_budget_cents: Optional[int] = None,
    simple_bet_price_cents: Optional[int] = None,
    price_updated_at: Optional[str] = None,
    price_source: Optional[str] = None,
) -> Dict[str, Any]:
    """Calcula exatamente o espaço combinatório restrito por fixos/excluídos, permutações e orçamento."""
    part = validate_and_partition_constraints(
        universe_size=universe_size,
        drawn_count=drawn_count,
        chosen_count=chosen_count,
        fixed_numbers=fixed_numbers,
        excluded_numbers=excluded_numbers,
        variable_numbers=variable_numbers,
    )

    f = part["fixed_count"]
    v = part["variable_count"]
    e = part["excluded_count"]
    r = part["remaining_slots"]

    total_unrestricted = comb(universe_size, chosen_count)
    total_simple_space = comb(universe_size, drawn_count)
    restricted_combinations = comb(v, r)

    # Permutações (aplicáveis quando a ordem importa, diferenciadas de combinações de loteria)
    permutations_ordered_k_in_m = perm(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
    internal_orderings_m = factorial(chosen_count) if chosen_count <= 25 else None

    equivalent_simple_per_bet = comb(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
    unit_bet_cost_cents = (
        equivalent_simple_per_bet * simple_bet_price_cents
        if simple_bet_price_cents is not None
        else None
    )

    space_share_frac = Fraction(restricted_combinations, total_unrestricted)
    reduction_factor = (
        float(Decimal(total_unrestricted) / Decimal(restricted_combinations))
        if restricted_combinations > 0
        else 0.0
    )

    desired_clamped = max(1, desired_games_count)
    feasible_desired = min(desired_clamped, restricted_combinations)

    if unit_bet_cost_cents is not None and unit_bet_cost_cents > 0 and max_budget_cents is not None:
        affordable_games = max_budget_cents // unit_bet_cost_cents
        planned_games = min(feasible_desired, affordable_games)
        planned_cost_cents = planned_games * unit_bet_cost_cents
        remaining_budget_cents = max_budget_cents - planned_cost_cents
        left_out_by_budget = max(0, feasible_desired - planned_games)
    else:
        affordable_games = feasible_desired if unit_bet_cost_cents is None else None
        planned_games = feasible_desired
        planned_cost_cents = (
            planned_games * unit_bet_cost_cents if unit_bet_cost_cents is not None else None
        )
        remaining_budget_cents = None
        left_out_by_budget = 0

    left_out_from_restricted_space = max(0, restricted_combinations - planned_games)
    full_closure_cost_cents = (
        restricted_combinations * unit_bet_cost_cents
        if unit_bet_cost_cents is not None
        else None
    )

    # Razão exata das apostas planejadas dentro do espaço restrito e dentro do espaço simples
    planned_vs_restricted_frac = (
        Fraction(planned_games, restricted_combinations)
        if restricted_combinations > 0
        else Fraction(0, 1)
    )
    planned_simple_equiv = planned_games * equivalent_simple_per_bet
    planned_vs_simple_space_frac = Fraction(min(planned_simple_equiv, total_simple_space), total_simple_space)

    formula_str = "|Ω_restrito| = C(N − |E| − |F|, m − |F|) = C(|V|, m − |F|)"
    substituted_str = (
        f"C({universe_size} − {e} − {f}, {chosen_count} − {f}) = C({v}, {r}) = {restricted_combinations}"
    )

    return {
        "lottery_code": lottery_code,
        "universe_size": universe_size,
        "drawn_count": drawn_count,
        "chosen_count": chosen_count,
        "partition": part,
        "combinatorics": {
            "total_unrestricted_combinations": str(total_unrestricted),
            "total_simple_space_combinations": str(total_simple_space),
            "restricted_combinations": str(restricted_combinations),
            "restricted_share_exact_numerator": str(space_share_frac.numerator),
            "restricted_share_exact_denominator": str(space_share_frac.denominator),
            "restricted_share_percentage": _format_decimal_pct(space_share_frac),
            "reduction_factor": round(reduction_factor, 4),
            "equivalent_simple_bets_per_game": str(equivalent_simple_per_bet),
            "permutations_k_from_m": str(permutations_ordered_k_in_m),
            "internal_bet_permutations_m_factorial": (
                str(internal_orderings_m) if internal_orderings_m is not None else None
            ),
            "permutations_applicability_note": (
                "Em loterias numéricas sem ordem de extração (como Mega-Sena e Lotofácil), "
                "a contagem de apostas distintas usa combinações C(m, k) — a ordem não gera novos bilhetes. "
                "Permutações/arranjos P(m, k) aplicam-se apenas a eventos posicionais ou ordenados."
            ),
            "formula": formula_str,
            "substituted_formula": substituted_str,
        },
        "budget_and_costs": {
            "simple_bet_price_cents": simple_bet_price_cents,
            "unit_bet_cost_cents": str(unit_bet_cost_cents) if unit_bet_cost_cents is not None else None,
            "price_updated_at": price_updated_at,
            "price_source": price_source,
            "desired_games_count": desired_clamped,
            "feasible_desired_games": str(feasible_desired),
            "max_budget_cents": str(max_budget_cents) if max_budget_cents is not None else None,
            "affordable_games_count": str(affordable_games) if affordable_games is not None else None,
            "planned_games_count": str(planned_games),
            "planned_total_cost_cents": str(planned_cost_cents) if planned_cost_cents is not None else None,
            "remaining_budget_cents": str(remaining_budget_cents) if remaining_budget_cents is not None else None,
            "left_out_by_budget": str(left_out_by_budget),
            "left_out_from_restricted_space": str(left_out_from_restricted_space),
            "full_restricted_closure_cost_cents": (
                str(full_closure_cost_cents) if full_closure_cost_cents is not None else None
            ),
            "planned_vs_restricted_fraction": (
                f"{planned_vs_restricted_frac.numerator} / {planned_vs_restricted_frac.denominator}"
            ),
            "planned_vs_restricted_percentage": _format_decimal_pct(planned_vs_restricted_frac),
            "planned_nominal_simple_combinations": str(planned_simple_equiv),
            "upper_bound_simple_space_fraction": (
                f"{planned_vs_simple_space_frac.numerator} / {planned_vs_simple_space_frac.denominator}"
            ),
        },
        "axiom_notice": NO_PREDICTION_NOTICE,
        "execution_source": "python_fastapi_engine",
    }


def analyze_bet_set(
    *,
    lottery_code: str,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    bets: Sequence[Sequence[int]],
    fixed_numbers: Sequence[int] = (),
    excluded_numbers: Sequence[int] = (),
    simple_bet_price_cents: Optional[int] = None,
    price_updated_at: Optional[str] = None,
    price_source: Optional[str] = None,
) -> Dict[str, Any]:
    """Analisa exatamente um conjunto de apostas (distintas, repetidas, interseções, redundância e distribuição)."""
    if not bets:
        raise ValueError("Informe ao menos 1 aposta para análise combinatória do conjunto.")
    if len(bets) > 500:
        raise ValueError("Limite de 500 apostas por requisição de análise detalhada.")

    fixed_set = set(fixed_numbers)
    excluded_set = set(excluded_numbers)
    overlap_fe = sorted(fixed_set.intersection(excluded_set))
    if overlap_fe:
        raise ValueError(f"Conflito entre fixos e excluídos: {overlap_fe}.")

    normalized_bets: List[Tuple[int, ...]] = []
    constraint_violations: List[Dict[str, Any]] = []

    for idx, raw_bet in enumerate(bets):
        if len(raw_bet) != chosen_count:
            raise ValueError(
                f"Aposta #{idx + 1} deve conter exatamente {chosen_count} dezenas (recebidas: {len(raw_bet)})."
            )
        uniq = sorted(set(raw_bet))
        if len(uniq) != chosen_count:
            raise ValueError(f"Aposta #{idx + 1} contém dezenas repetidas.")
        for n in uniq:
            if n < 1 or n > universe_size:
                raise ValueError(f"Dezena {n} na aposta #{idx + 1} fora do universo [1..{universe_size}].")

        bet_set = set(uniq)
        missing_fixed = sorted(fixed_set - bet_set)
        used_excluded = sorted(bet_set.intersection(excluded_set))
        if missing_fixed or used_excluded:
            constraint_violations.append(
                {
                    "bet_index": idx + 1,
                    "missing_fixed": missing_fixed,
                    "used_excluded": used_excluded,
                }
            )
        normalized_bets.append(tuple(uniq))

    submitted_count = len(normalized_bets)
    freq_bets = Counter(normalized_bets)
    distinct_bets = list(freq_bets.keys())
    distinct_count = len(distinct_bets)
    repeated_count = submitted_count - distinct_count

    duplicate_groups = [
        {"bet": list(b), "occurrences": count}
        for b, count in freq_bets.items()
        if count > 1
    ]

    # Interseções par-a-par sobre as apostas distintas (e par-a-par total)
    distinct_sets = [set(b) for b in distinct_bets]
    overlap_hist: Counter[int] = Counter()
    pair_overlaps: List[int] = []
    top_pairs: List[Dict[str, Any]] = []

    for i in range(distinct_count):
        for j in range(i + 1, distinct_count):
            common = len(distinct_sets[i].intersection(distinct_sets[j]))
            overlap_hist[common] += 1
            pair_overlaps.append(common)
            if len(top_pairs) < 10 or common > top_pairs[-1]["overlap"]:
                top_pairs.append({"bet_a": i + 1, "bet_b": j + 1, "overlap": common})
                top_pairs.sort(key=lambda x: x["overlap"], reverse=True)
                top_pairs = top_pairs[:10]

    pair_count = len(pair_overlaps)
    if pair_count > 0:
        min_ov = min(pair_overlaps)
        max_ov = max(pair_overlaps)
        sum_ov = sum(pair_overlaps)
        avg_frac = Fraction(sum_ov, pair_count)
        avg_ov = float(Decimal(avg_frac.numerator) / Decimal(avg_frac.denominator))
        disjoint_pairs = overlap_hist.get(0, 0)
    else:
        min_ov = 0
        max_ov = 0
        avg_frac = Fraction(0, 1)
        avg_ov = 0.0
        disjoint_pairs = 0

    # Expansão em combinações simples de tamanho k (redundância exata de bilhetes simples embutidos)
    simple_per_bet = comb(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
    nominal_simple_submitted = submitted_count * simple_per_bet
    nominal_simple_distinct_bets = distinct_count * simple_per_bet
    total_simple_space = comb(universe_size, drawn_count)

    exact_simple_computed = False
    distinct_simple_count: Optional[int] = None
    redundant_simple_between_bets: Optional[int] = None
    redundancy_rate_pct: Optional[str] = None
    main_prize_exact: Optional[Dict[str, Any]] = None

    if simple_per_bet > 0 and nominal_simple_distinct_bets <= 250_000:
        exact_simple_computed = True
        if chosen_count == drawn_count:
            distinct_simple_count = distinct_count
        else:
            simple_union = set()
            for bet in distinct_bets:
                for sub in combinations(bet, drawn_count):
                    simple_union.add(sub)
            distinct_simple_count = len(simple_union)

        redundant_simple_between_bets = nominal_simple_submitted - distinct_simple_count
        red_frac = (
            Fraction(redundant_simple_between_bets, nominal_simple_submitted)
            if nominal_simple_submitted > 0
            else Fraction(0, 1)
        )
        redundancy_rate_pct = _format_decimal_pct(red_frac)

        main_frac = Fraction(distinct_simple_count, total_simple_space)
        main_prize_exact = {
            "raw_numerator": str(distinct_simple_count),
            "raw_denominator": str(total_simple_space),
            "exact_numerator": str(main_frac.numerator),
            "exact_denominator": str(main_frac.denominator),
            "probability": float(Decimal(main_frac.numerator) / Decimal(main_frac.denominator)),
            "percentage": _format_decimal_pct(main_frac),
            "scientific_notation": _format_decimal_sci(main_frac),
            "odds_one_in": _rounded_odds_one_in(main_frac),
        }

    # Distribuição dos números selecionados em 1..N (sobre apostas submetidas)
    num_counts: Counter[int] = Counter()
    even_counts: List[int] = []
    sums: List[int] = []
    for b in normalized_bets:
        for n in b:
            num_counts[n] += 1
        even_counts.append(sum(1 for n in b if n % 2 == 0))
        sums.append(sum(b))

    number_frequency = [
        {
            "number": n,
            "count": num_counts.get(n, 0),
            "pct_of_bets": round((num_counts.get(n, 0) / submitted_count) * 100.0, 2),
        }
        for n in range(1, universe_size + 1)
    ]
    unused_numbers = [item["number"] for item in number_frequency if item["count"] == 0]
    used_numbers_count = universe_size - len(unused_numbers)

    unit_cost_cents = (
        simple_per_bet * simple_bet_price_cents
        if simple_bet_price_cents is not None
        else None
    )
    total_cost_cents = (
        submitted_count * unit_cost_cents if unit_cost_cents is not None else None
    )
    distinct_cost_cents = (
        distinct_count * unit_cost_cents if unit_cost_cents is not None else None
    )

    return {
        "lottery_code": lottery_code,
        "universe_size": universe_size,
        "drawn_count": drawn_count,
        "chosen_count": chosen_count,
        "counts": {
            "submitted_bets_count": submitted_count,
            "distinct_bets_count": distinct_count,
            "repeated_bets_count": repeated_count,
            "duplicate_groups": duplicate_groups,
            "constraint_violations": constraint_violations,
            "all_bets_respect_constraints": len(constraint_violations) == 0,
        },
        "intersections": {
            "distinct_pair_count": pair_count,
            "min_overlap": min_ov,
            "max_overlap": max_ov,
            "avg_overlap": round(avg_ov, 4),
            "avg_overlap_exact": f"{avg_frac.numerator}/{avg_frac.denominator}",
            "disjoint_pairs_count": disjoint_pairs,
            "overlap_histogram": {str(k): v for k, v in sorted(overlap_hist.items())},
            "top_overlapping_pairs": top_pairs,
        },
        "redundancy": {
            "simple_combinations_per_bet": str(simple_per_bet),
            "nominal_simple_combinations": str(nominal_simple_submitted),
            "exact_simple_expansion_computed": exact_simple_computed,
            "distinct_simple_combinations": (
                str(distinct_simple_count) if distinct_simple_count is not None else None
            ),
            "redundant_simple_combinations": (
                str(redundant_simple_between_bets)
                if redundant_simple_between_bets is not None
                else None
            ),
            "redundancy_rate_percentage": redundancy_rate_pct,
            "main_prize_exact": main_prize_exact,
        },
        "distribution": {
            "used_numbers_count": used_numbers_count,
            "unused_numbers_count": len(unused_numbers),
            "unused_numbers": unused_numbers,
            "number_frequency": number_frequency,
            "sum_min": min(sums),
            "sum_max": max(sums),
            "sum_avg": round(sum(sums) / len(sums), 2),
            "even_min": min(even_counts),
            "even_max": max(even_counts),
            "even_avg": round(sum(even_counts) / len(even_counts), 2),
        },
        "costs": {
            "simple_bet_price_cents": simple_bet_price_cents,
            "unit_bet_cost_cents": str(unit_cost_cents) if unit_cost_cents is not None else None,
            "total_submitted_cost_cents": str(total_cost_cents) if total_cost_cents is not None else None,
            "distinct_only_cost_cents": str(distinct_cost_cents) if distinct_cost_cents is not None else None,
            "wasted_on_duplicates_cents": (
                str(total_cost_cents - distinct_cost_cents)
                if total_cost_cents is not None and distinct_cost_cents is not None
                else None
            ),
            "price_updated_at": price_updated_at,
            "price_source": price_source,
        },
        "axiom_notice": NO_PREDICTION_NOTICE,
        "execution_source": "python_fastapi_engine",
    }


def compare_strategies(
    *,
    lottery_code: str,
    universe_size: int,
    drawn_count: int,
    min_numbers_to_choose: int,
    max_numbers_to_choose: int,
    prize_tiers: List[Dict[str, Any]],
    simple_bet_price_cents: Optional[int],
    price_updated_at: Optional[str],
    price_source: Optional[str],
    strategies: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compara de 1 a 5 estratégias combinatórias simultaneamente com custos, cobertura e probabilidades exatas."""
    if not (1 <= len(strategies) <= 5):
        raise ValueError("O comparador suporta entre 1 e 5 estratégias simultaneamente.")

    evaluated: List[Dict[str, Any]] = []
    baseline_cost: Optional[int] = None
    baseline_cov_pct: Optional[float] = None
    baseline_distinct_simple: Optional[int] = None

    for idx, strat in enumerate(strategies):
        name = str(strat.get("name") or f"Estratégia {idx + 1}")
        chosen_count = int(strat["chosen_count"])
        if chosen_count < min_numbers_to_choose or chosen_count > max_numbers_to_choose:
            raise ValueError(
                f"Estratégia '{name}': chosen_count={chosen_count} fora dos limites [{min_numbers_to_choose}..{max_numbers_to_choose}]."
            )

        fixed_nums = strat.get("fixed_numbers") or []
        excluded_nums = strat.get("excluded_numbers") or []
        target_t = int(strat.get("coverage_target_t") or min(3, drawn_count, chosen_count))
        explicit_bets = strat.get("bets")
        seed = strat.get("seed") if strat.get("seed") is not None else (2026 + idx)

        if explicit_bets is not None and len(explicit_bets) > 0:
            bets_used = [sorted(b) for b in explicit_bets]
            method_used = "explicit_bets"
            is_exact_method = True
            generation_summary = None
        else:
            desired = int(strat.get("desired_games_count") or 5)
            method_used = str(strat.get("method") or "coverage_heuristic")
            max_budget_cents = strat.get("max_budget_cents")
            gen_res = generate_controlled_bets(
                lottery_code=lottery_code,
                universe_size=universe_size,
                drawn_count=drawn_count,
                chosen_count=chosen_count,
                fixed_numbers=fixed_nums,
                excluded_numbers=excluded_nums,
                desired_games_count=desired,
                method=method_used,
                coverage_target_t=target_t,
                seed=seed,
                max_budget_cents=max_budget_cents,
                simple_bet_price_cents=simple_bet_price_cents,
                price_updated_at=price_updated_at,
                price_source=price_source,
            )
            bets_used = gen_res["generated_bets"]
            is_exact_method = gen_res["method_classification"]["is_exact_solution"]
            generation_summary = gen_res["method_classification"]

        set_analysis = analyze_bet_set(
            lottery_code=lottery_code,
            universe_size=universe_size,
            drawn_count=drawn_count,
            chosen_count=chosen_count,
            bets=bets_used,
            fixed_numbers=fixed_nums,
            excluded_numbers=excluded_nums,
            simple_bet_price_cents=simple_bet_price_cents,
            price_updated_at=price_updated_at,
            price_source=price_source,
        )

        # Pool para cobertura: se houver excluídos, P = U \ E; senão U completo
        pool_nums = sorted(set(range(1, universe_size + 1)) - set(excluded_nums))
        if not pool_nums or len(pool_nums) < target_t:
            pool_nums = list(range(1, universe_size + 1))
        cov_analysis = analyze_subset_coverage(
            lottery_code=lottery_code,
            universe_size=universe_size,
            drawn_count=drawn_count,
            chosen_count=chosen_count,
            bets=bets_used,
            target_subset_size=target_t,
            pool_numbers=pool_nums,
        )

        # Probabilidade exata de qualquer premiação quando as apostas são simples e <= 12 distintas
        exact_any_prize: Optional[Dict[str, Any]] = None
        exact_union_status = "not_computed_for_large_or_multiple_set"
        if chosen_count == drawn_count and 1 <= set_analysis["counts"]["distinct_bets_count"] <= 12 and prize_tiers:
            distinct_simple_list = sorted({tuple(sorted(b)) for b in bets_used})
            union_res = _compute_exact_union_for_simple_bets(
                universe_size=universe_size,
                drawn_count=drawn_count,
                simple_bets=[list(b) for b in distinct_simple_list],
                effective_tiers=prize_tiers,
            )
            exact_any_prize = union_res["any_prize_union"]
            exact_union_status = "exact_union_computed"
        elif chosen_count > drawn_count and set_analysis["counts"]["distinct_bets_count"] == 1 and prize_tiers:
            # 1 volante múltiplo: podemos usar distribuição hipergeométrica exata
            from ..models.hypergeometric import HypergeometricLotteryModel
            spec_single = HypergeometricLotteryModel().compute_specialized(
                lottery_code=lottery_code,
                universe_size=universe_size,
                drawn_count=drawn_count,
                chosen_count=chosen_count,
                min_numbers_to_choose=min_numbers_to_choose,
                max_numbers_to_choose=max_numbers_to_choose,
                prize_tiers=prize_tiers,
                simple_bet_price_cents=simple_bet_price_cents,
                price_updated_at=price_updated_at,
                price_source=price_source,
                simple_games_count=1,
            )
            exact_any_prize = {
                "raw_numerator": spec_single["any_prize"]["raw_numerator"],
                "raw_denominator": spec_single["any_prize"]["raw_denominator"],
                "exact_numerator": spec_single["any_prize"]["exact_numerator"],
                "exact_denominator": spec_single["any_prize"]["exact_denominator"],
                "probability": spec_single["any_prize"]["probability"],
                "scientific_notation": spec_single["any_prize"]["scientific_notation"],
                "odds_one_in": spec_single["any_prize"]["odds_one_in"],
            }
            exact_union_status = "exact_single_multiple_bet"

        total_cost_int = (
            int(set_analysis["costs"]["total_submitted_cost_cents"])
            if set_analysis["costs"]["total_submitted_cost_cents"] is not None
            else None
        )
        cov_pct = cov_analysis["coverage"]["coverage_percentage"]
        distinct_simple_int = (
            int(set_analysis["redundancy"]["distinct_simple_combinations"])
            if set_analysis["redundancy"]["distinct_simple_combinations"] is not None
            else None
        )

        if idx == 0:
            baseline_cost = total_cost_int
            baseline_cov_pct = cov_pct
            baseline_distinct_simple = distinct_simple_int

        delta_cost = (
            total_cost_int - baseline_cost
            if total_cost_int is not None and baseline_cost is not None
            else None
        )
        delta_cov_pct = (
            round(cov_pct - baseline_cov_pct, 6)
            if baseline_cov_pct is not None
            else None
        )
        delta_distinct_simple = (
            distinct_simple_int - baseline_distinct_simple
            if distinct_simple_int is not None and baseline_distinct_simple is not None
            else None
        )

        evaluated.append(
            {
                "index": idx + 1,
                "name": name,
                "chosen_count": chosen_count,
                "method": method_used,
                "is_exact_method": is_exact_method,
                "generation_classification": generation_summary,
                "bets_count": set_analysis["counts"]["submitted_bets_count"],
                "distinct_bets_count": set_analysis["counts"]["distinct_bets_count"],
                "repeated_bets_count": set_analysis["counts"]["repeated_bets_count"],
                "total_cost_cents": set_analysis["costs"]["total_submitted_cost_cents"],
                "distinct_simple_combinations": set_analysis["redundancy"]["distinct_simple_combinations"],
                "redundant_simple_combinations": set_analysis["redundancy"]["redundant_simple_combinations"],
                "intersections": {
                    "min_overlap": set_analysis["intersections"]["min_overlap"],
                    "max_overlap": set_analysis["intersections"]["max_overlap"],
                    "avg_overlap": set_analysis["intersections"]["avg_overlap"],
                },
                "coverage": {
                    "target_subset_size": target_t,
                    "pool_size": cov_analysis["pool_size"],
                    "covered_subsets_count": cov_analysis["coverage"]["covered_subsets_count"],
                    "total_pool_subsets": cov_analysis["coverage"]["total_pool_subsets"],
                    "coverage_percentage": cov_pct,
                    "coverage_fraction": cov_analysis["coverage"]["coverage_fraction"],
                    "is_full_coverage_proven": cov_analysis["coverage"]["is_full_coverage_proven"],
                },
                "probabilities": {
                    "main_prize_exact": set_analysis["redundancy"]["main_prize_exact"],
                    "exact_any_prize": exact_any_prize,
                    "exact_union_status": exact_union_status,
                },
                "delta_vs_baseline": {
                    "cost_cents": str(delta_cost) if delta_cost is not None else None,
                    "coverage_percentage_points": delta_cov_pct,
                    "distinct_simple_combinations": (
                        str(delta_distinct_simple) if delta_distinct_simple is not None else None
                    ),
                },
                "sample_bets": bets_used[:10],
            }
        )

    return {
        "lottery_code": lottery_code,
        "universe_size": universe_size,
        "drawn_count": drawn_count,
        "simple_bet_price_cents": simple_bet_price_cents,
        "price_updated_at": price_updated_at,
        "price_source": price_source,
        "strategies_count": len(evaluated),
        "strategies": evaluated,
        "axiom_notice": NO_PREDICTION_NOTICE,
        "execution_source": "python_fastapi_engine",
    }
