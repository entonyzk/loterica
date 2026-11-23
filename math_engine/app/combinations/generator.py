"""Gerador controlado de combinações: enumeração exaustiva, amostragem uniforme, heurística gulosa e busca combinatória."""

from collections import Counter
from itertools import combinations
from math import comb
import random
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .coverage import analyze_subset_coverage

MAX_EXHAUSTIVE_SPACE = 5_000
MAX_GENERATED_GAMES = 300


def _validate_composition(
    bet: Tuple[int, ...],
    *,
    min_even: Optional[int],
    max_even: Optional[int],
    min_sum: Optional[int],
    max_sum: Optional[int],
    max_consecutive: Optional[int],
) -> bool:
    if min_even is not None or max_even is not None:
        evens = sum(1 for n in bet if n % 2 == 0)
        if min_even is not None and evens < min_even:
            return False
        if max_even is not None and evens > max_even:
            return False

    if min_sum is not None or max_sum is not None:
        total = sum(bet)
        if min_sum is not None and total < min_sum:
            return False
        if max_sum is not None and total > max_sum:
            return False

    if max_consecutive is not None:
        streak = 1
        best = 1
        for i in range(1, len(bet)):
            if bet[i] == bet[i - 1] + 1:
                streak += 1
                if streak > best:
                    best = streak
            else:
                streak = 1
        if best > max_consecutive:
            return False

    return True


def _unrank_combination(items: Sequence[int], r: int, index: int) -> Tuple[int, ...]:
    """Mapeia deterministicamente um índice lexicográfico [0..C(n,r)-1] para combinação única."""
    n = len(items)
    result: List[int] = []
    start = 0
    rem = index
    for slot in range(r):
        need = r - slot - 1
        for pos in range(start, n - need):
            count = comb(n - pos - 1, need)
            if rem < count:
                result.append(items[pos])
                start = pos + 1
                break
            rem -= count
    return tuple(result)


def generate_controlled_bets(
    *,
    lottery_code: str,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    fixed_numbers: Sequence[int] = (),
    excluded_numbers: Sequence[int] = (),
    variable_numbers: Optional[Sequence[int]] = None,
    desired_games_count: int = 10,
    method: str = "uniform_sampling",
    coverage_target_t: Optional[int] = None,
    seed: Optional[int] = None,
    max_budget_cents: Optional[int] = None,
    simple_bet_price_cents: Optional[int] = None,
    price_updated_at: Optional[str] = None,
    price_source: Optional[str] = None,
    min_even: Optional[int] = None,
    max_even: Optional[int] = None,
    min_sum: Optional[int] = None,
    max_sum: Optional[int] = None,
    max_consecutive: Optional[int] = None,
) -> Dict[str, Any]:
    """Constrói conjuntos de apostas sem duplicatas respeitando fixos, excluídos, composição e orçamento."""
    from .combinatorics_ops import validate_and_partition_constraints

    part = validate_and_partition_constraints(
        universe_size=universe_size,
        drawn_count=drawn_count,
        chosen_count=chosen_count,
        fixed_numbers=fixed_numbers,
        excluded_numbers=excluded_numbers,
        variable_numbers=variable_numbers,
    )

    if desired_games_count < 1 or desired_games_count > MAX_GENERATED_GAMES:
        raise ValueError(f"desired_games_count deve estar entre 1 e {MAX_GENERATED_GAMES}.")

    fixed = tuple(part["fixed_numbers"])
    variable = part["variable_numbers"]
    pool = sorted(set(fixed).union(variable))
    r = part["remaining_slots"]
    restricted_space = comb(len(variable), r)

    eq_simple_per_bet = comb(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
    unit_cost_cents = (
        eq_simple_per_bet * simple_bet_price_cents
        if simple_bet_price_cents is not None
        else None
    )

    affordable_limit: Optional[int] = None
    if max_budget_cents is not None and unit_cost_cents is not None and unit_cost_cents > 0:
        affordable_limit = max_budget_cents // unit_cost_cents
        effective_target = min(desired_games_count, affordable_limit, restricted_space)
    else:
        effective_target = min(desired_games_count, restricted_space)

    if max_budget_cents is not None and unit_cost_cents is not None and effective_target == 0:
        raise ValueError(
            f"Orçamento informado ({max_budget_cents} centavos) é insuficiente para 1 aposta "
            f"(custo unitário: {unit_cost_cents} centavos)."
        )

    t_target = coverage_target_t if coverage_target_t is not None else min(3, drawn_count, chosen_count)
    if t_target < 1 or t_target > min(chosen_count, drawn_count):
        raise ValueError(f"coverage_target_t={t_target} fora dos limites [1..{min(chosen_count, drawn_count)}].")

    effective_seed = seed if seed is not None else 202603
    rng = random.Random(effective_seed)
    has_filters = any(
        x is not None for x in (min_even, max_even, min_sum, max_sum, max_consecutive)
    )

    generated: List[Tuple[int, ...]] = []
    seen: Set[Tuple[int, ...]] = set()
    rejected_by_filters = 0
    is_exact_exhaustive = False
    total_filtered_space: Optional[int] = None

    if method == "exhaustive":
        if restricted_space > MAX_EXHAUSTIVE_SPACE:
            raise ValueError(
                f"Enumeração exaustiva bloqueada: espaço restrito C({len(variable)}, {r}) = {restricted_space} "
                f"excede o limite seguro ({MAX_EXHAUSTIVE_SPACE}). Adicione números fixos/excluídos ou escolha outro método."
            )
        all_valid: List[Tuple[int, ...]] = []
        for tail in combinations(variable, r):
            cand = tuple(sorted(fixed + tail))
            if _validate_composition(
                cand,
                min_even=min_even,
                max_even=max_even,
                min_sum=min_sum,
                max_sum=max_sum,
                max_consecutive=max_consecutive,
            ):
                all_valid.append(cand)
            else:
                rejected_by_filters += 1

        total_filtered_space = len(all_valid)
        generated = all_valid[:effective_target]
        is_exact_exhaustive = len(generated) == total_filtered_space

    elif method == "uniform_sampling":
        if not has_filters:
            # Amostragem uniforme exata sem reposição via índices inteiros distintos
            if restricted_space <= 50_000:
                sampled_indices = rng.sample(range(restricted_space), effective_target)
            else:
                idx_set: Set[int] = set()
                while len(idx_set) < effective_target:
                    idx_set.add(rng.randrange(restricted_space))
                sampled_indices = sorted(idx_set)
            generated = [
                tuple(sorted(fixed + _unrank_combination(variable, r, idx)))
                for idx in sampled_indices
            ]
        else:
            attempts = 0
            max_attempts = max(6000, effective_target * 250)
            while len(generated) < effective_target and attempts < max_attempts:
                attempts += 1
                tail = tuple(rng.sample(variable, r))
                cand = tuple(sorted(fixed + tail))
                if cand in seen:
                    continue
                if _validate_composition(
                    cand,
                    min_even=min_even,
                    max_even=max_even,
                    min_sum=min_sum,
                    max_sum=max_sum,
                    max_consecutive=max_consecutive,
                ):
                    seen.add(cand)
                    generated.append(cand)
                else:
                    rejected_by_filters += 1

    elif method in ("coverage_heuristic", "combinatorial_search"):
        # Seleção gulosa maximizando novos t-subconjuntos cobertos (e balanço de frequência)
        covered_t: Set[Tuple[int, ...]] = set()
        num_freq: Counter[int] = Counter()
        can_score_t_exact = comb(chosen_count, t_target) <= 4_000

        candidate_pool_size = 80 if method == "coverage_heuristic" else 140
        for step in range(effective_target):
            best_cand: Optional[Tuple[int, ...]] = None
            best_score: Tuple[int, float] = (-1, -1e18)

            attempts = 0
            local_candidates: List[Tuple[int, ...]] = []
            while len(local_candidates) < candidate_pool_size and attempts < candidate_pool_size * 20:
                attempts += 1
                if r == 0:
                    cand = fixed
                else:
                    # Bias suave inicial por menor frequência para balancear uso das dezenas livres
                    weights = [1.0 / (1.0 + num_freq[x]) for x in variable]
                    chosen_tail: List[int] = []
                    avail = list(variable)
                    avail_w = list(weights)
                    for _ in range(r):
                        pick = rng.choices(avail, weights=avail_w, k=1)[0]
                        idx_p = avail.index(pick)
                        chosen_tail.append(pick)
                        avail.pop(idx_p)
                        avail_w.pop(idx_p)
                    cand = tuple(sorted(fixed + tuple(chosen_tail)))

                if cand in seen:
                    continue
                if _validate_composition(
                    cand,
                    min_even=min_even,
                    max_even=max_even,
                    min_sum=min_sum,
                    max_sum=max_sum,
                    max_consecutive=max_consecutive,
                ):
                    local_candidates.append(cand)
                else:
                    rejected_by_filters += 1
                if r == 0:
                    break

            if not local_candidates and restricted_space <= 5_000:
                for tail in combinations(variable, r):
                    cand = tuple(sorted(fixed + tail))
                    if cand not in seen and _validate_composition(
                        cand,
                        min_even=min_even,
                        max_even=max_even,
                        min_sum=min_sum,
                        max_sum=max_sum,
                        max_consecutive=max_consecutive,
                    ):
                        local_candidates.append(cand)
                        if len(local_candidates) >= 20:
                            break

            for cand in local_candidates:
                if can_score_t_exact:
                    new_cov = sum(1 for sub in combinations(cand, t_target) if sub not in covered_t)
                else:
                    new_cov = sum(1 for n in cand if num_freq[n] == 0)
                freq_penalty = -sum(num_freq[n] for n in cand)
                score = (new_cov, float(freq_penalty))
                if score > best_score:
                    best_score = score
                    best_cand = cand

            if best_cand is None:
                break

            seen.add(best_cand)
            generated.append(best_cand)
            for n in best_cand:
                num_freq[n] += 1
            if can_score_t_exact:
                for sub in combinations(best_cand, t_target):
                    covered_t.add(sub)

        # Refinamento local por troca (1-opt) no modo combinatorial_search
        if method == "combinatorial_search" and len(generated) >= 2 and can_score_t_exact and r >= 1:
            # Tenta substituir a aposta com menor contribuição marginal única por novas candidatas melhores
            for _ in range(min(25, len(generated) * 2)):
                worst_idx = -1
                worst_unique = 10**9
                for i in range(len(generated)):
                    others_cov: Set[Tuple[int, ...]] = set()
                    for j, b in enumerate(generated):
                        if i != j:
                            others_cov.update(combinations(b, t_target))
                    unique_i = sum(1 for sub in combinations(generated[i], t_target) if sub not in others_cov)
                    if unique_i < worst_unique:
                        worst_unique = unique_i
                        worst_idx = i

                if worst_idx < 0:
                    break
                others_cov = set()
                for j, b in enumerate(generated):
                    if j != worst_idx:
                        others_cov.update(combinations(b, t_target))

                best_rep = generated[worst_idx]
                best_rep_unique = worst_unique
                for _try in range(60):
                    cand = tuple(sorted(fixed + tuple(rng.sample(variable, r))))
                    if cand in seen:
                        continue
                    if not _validate_composition(
                        cand,
                        min_even=min_even,
                        max_even=max_even,
                        min_sum=min_sum,
                        max_sum=max_sum,
                        max_consecutive=max_consecutive,
                    ):
                        continue
                    u_cand = sum(1 for sub in combinations(cand, t_target) if sub not in others_cov)
                    if u_cand > best_rep_unique:
                        best_rep_unique = u_cand
                        best_rep = cand

                if best_rep != generated[worst_idx]:
                    seen.remove(generated[worst_idx])
                    seen.add(best_rep)
                    generated[worst_idx] = best_rep

    else:
        raise ValueError(
            f"Método de geração desconhecido: '{method}'. "
            "Valores aceitos: exhaustive, uniform_sampling, coverage_heuristic, combinatorial_search."
        )

    if not generated:
        raise ValueError(
            "Nenhuma combinação satisfez simultaneamente os filtros de composição, fixos/excluídos e orçamento."
        )

    generated_lists = [list(b) for b in generated]
    coverage_report = analyze_subset_coverage(
        lottery_code=lottery_code,
        universe_size=universe_size,
        drawn_count=drawn_count,
        chosen_count=chosen_count,
        bets=generated_lists,
        target_subset_size=t_target,
        pool_numbers=pool,
    )

    is_full_cov = coverage_report["coverage"]["is_full_coverage_proven"]
    if method == "exhaustive":
        nature = "exact_enumeration" if is_exact_exhaustive else "exact_partial_enumeration"
        label = (
            "Enumeração Exaustiva Completa (espaço restrito integral)"
            if is_exact_exhaustive
            else "Enumeração Exaustiva Parcial (limitada por orçamento ou quantidade solicitada)"
        )
        is_exact_solution = is_exact_exhaustive
    elif method == "uniform_sampling":
        nature = "stochastic_uniform_without_replacement"
        label = "Amostragem Uniforme Sem Reposição (não exaustiva)"
        is_exact_solution = False
    elif method == "coverage_heuristic":
        nature = "heuristic"
        label = "Heurística Gulosa de Cobertura (não garante conjunto mínimo ótimo)"
        is_exact_solution = False
    else:
        nature = "heuristic_search"
        label = "Busca Combinatória Otimizada com Refinamento Local (heurística — sem prova de otimalidade global)"
        is_exact_solution = False

    total_cost_cents = (
        len(generated_lists) * unit_cost_cents if unit_cost_cents is not None else None
    )
    remaining_budget_cents = (
        max_budget_cents - total_cost_cents
        if max_budget_cents is not None and total_cost_cents is not None
        else None
    )
    left_out_from_restricted = max(0, restricted_space - len(generated_lists))
    left_out_from_desired = max(0, desired_games_count - len(generated_lists))

    return {
        "lottery_code": lottery_code,
        "universe_size": universe_size,
        "drawn_count": drawn_count,
        "chosen_count": chosen_count,
        "partition": part,
        "method": method,
        "seed": effective_seed if method != "exhaustive" else None,
        "method_classification": {
            "method_nature": nature,
            "label": label,
            "is_exact_solution": is_exact_solution,
            "is_proven_optimal_covering": False,
            "is_full_t_coverage_proven": is_full_cov,
            "disclaimer": (
                "Solução heurística ou amostral: não constitui cobertura mínima ótima comprovada e não prevê sorteios."
                if not is_exact_solution
                else "Enumeração combinatória exata do espaço filtrado."
            ),
        },
        "generation_summary": {
            "desired_games_count": desired_games_count,
            "generated_count": len(generated_lists),
            "duplicates_count": 0,
            "rejected_by_composition_filters": rejected_by_filters,
            "restricted_space_combinations": str(restricted_space),
            "total_filtered_space": str(total_filtered_space) if total_filtered_space is not None else None,
            "left_out_from_desired": str(left_out_from_desired),
            "left_out_from_restricted_space": str(left_out_from_restricted),
        },
        "budget_summary": {
            "simple_bet_price_cents": simple_bet_price_cents,
            "unit_bet_cost_cents": str(unit_cost_cents) if unit_cost_cents is not None else None,
            "max_budget_cents": str(max_budget_cents) if max_budget_cents is not None else None,
            "affordable_games_limit": str(affordable_limit) if affordable_limit is not None else None,
            "total_cost_cents": str(total_cost_cents) if total_cost_cents is not None else None,
            "remaining_budget_cents": str(remaining_budget_cents) if remaining_budget_cents is not None else None,
            "price_updated_at": price_updated_at,
            "price_source": price_source,
        },
        "coverage_summary": coverage_report,
        "generated_bets": generated_lists,
        "execution_source": "python_fastapi_engine",
    }
