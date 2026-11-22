"""Modelos hipergeométricos especializados para modalidades de grupo único (Mega-Sena, Lotofácil, etc.)."""

from collections import defaultdict
from decimal import Decimal
from fractions import Fraction
from math import comb
from typing import Any, Dict, List, Optional, Set, Tuple

from ..core.axioms import (
    DISTRIBUTION_SUM_TOLERANCE,
    INDEPENDENCE_AXIOM_STATEMENT,
    hypergeometric_hit_detail,
)
from .base import BaseLotteryMathModel, ModelArchitectureCapabilities


def _format_decimal_scientific(frac: Fraction) -> str:
    if frac.numerator == 0:
        return "0"
    if frac.numerator == frac.denominator:
        return "1"
    dec_val = Decimal(frac.numerator) / Decimal(frac.denominator)
    return f"{dec_val:.8E}"


def _rounded_odds_one_in(frac: Fraction) -> Optional[str]:
    if frac.numerator <= 0:
        return None
    return str((frac.denominator + frac.numerator // 2) // frac.numerator)


def _format_pct(prob: float) -> str:
    if prob == 0.0:
        return "0%"
    if prob == 1.0:
        return "100%"
    return f"{prob * 100.0:.6g}%"


def _compute_embedded_simple_wins(
    chosen_count: int,
    drawn_count: int,
    actual_hits: int,
    prize_tiers: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if chosen_count <= drawn_count:
        for t in prize_tiers:
            if int(t["hits"]) == actual_hits:
                return [
                    {
                        "tier_name": str(t["tier_name"]),
                        "target_hits": actual_hits,
                        "winning_simple_combinations": "1",
                    }
                ]
        return []

    wins: List[Dict[str, Any]] = []
    for tier in sorted(prize_tiers, key=lambda x: int(x["hits"]), reverse=True):
        target_hits = int(tier["hits"])
        miss_needed = drawn_count - target_hits
        chosen_misses = chosen_count - actual_hits
        if target_hits <= actual_hits and 0 <= miss_needed <= chosen_misses:
            cnt = comb(actual_hits, target_hits) * comb(chosen_misses, miss_needed)
            if cnt > 0:
                wins.append(
                    {
                        "tier_name": str(tier["tier_name"]),
                        "target_hits": target_hits,
                        "winning_simple_combinations": str(cnt),
                    }
                )
    return wins


def _count_losing_draws_upward_closed(
    universe_size: int,
    drawn_count: int,
    bet_sets: List[Set[int]],
    h_min: int,
) -> int:
    """Conta exatamente quantos sorteios D (|D|=drawn_count) NÃO atingem h_min em nenhum bilhete."""
    q = len(bet_sets)
    if h_min <= 0:
        return 0

    mask_counts: Dict[int, int] = defaultdict(int)
    for x in range(1, universe_size + 1):
        m = 0
        for i, bs in enumerate(bet_sets):
            if x in bs:
                m |= 1 << i
        mask_counts[m] += 1

    outside = mask_counts.pop(0, 0)
    atoms = list(mask_counts.items())

    # Usa dualidade de complemento (escolher N - k não sorteadas) quando for menor e eficiente
    use_complement = (universe_size - drawn_count) < drawn_count and (drawn_count - h_min + 1) <= 6
    if use_complement:
        draw_need = universe_size - drawn_count
        lose_min = drawn_count - h_min + 1
        suffix_avail = [[0] * q for _ in range(len(atoms) + 1)]
        for idx in range(len(atoms) - 1, -1, -1):
            m, cnt = atoms[idx]
            for i in range(q):
                suffix_avail[idx][i] = suffix_avail[idx + 1][i] + (cnt if (m & (1 << i)) else 0)

        state_dp: Dict[Tuple[int, ...], int] = {(0,) * (q + 1): 1}
        for idx, (m, cnt) in enumerate(atoms):
            rem = suffix_avail[idx + 1]
            affected = [i for i in range(q) if (m & (1 << i))]
            next_dp: Dict[Tuple[int, ...], int] = defaultdict(int)
            for state, ways in state_dp.items():
                d = state[0]
                max_take = min(cnt, draw_need - d)
                for take in range(max_take + 1):
                    nd = d + take
                    new_h = list(state[1:])
                    for i in affected:
                        nh = new_h[i] + take
                        if nh > lose_min:
                            nh = lose_min
                        new_h[i] = nh
                    ok = True
                    for i in range(q):
                        if new_h[i] + rem[i] < lose_min or new_h[i] + (draw_need - nd) < lose_min:
                            ok = False
                            break
                    if ok:
                        next_dp[(nd, *new_h)] += ways * comb(cnt, take)
            state_dp = next_dp

        losing = 0
        target_tuple = (lose_min,) * q
        for state, ways in state_dp.items():
            if state[1:] == target_tuple:
                need_out = draw_need - state[0]
                if 0 <= need_out <= outside:
                    losing += ways * comb(outside, need_out)
        return losing

    state_dp = {(0,) * (q + 1): 1}
    for m, cnt in atoms:
        affected = [i for i in range(q) if (m & (1 << i))]
        next_dp = defaultdict(int)
        for state, ways in state_dp.items():
            d = state[0]
            max_take = min(cnt, drawn_count - d)
            for take in range(max_take + 1):
                nd = d + take
                new_h = list(state[1:])
                ok = True
                for i in affected:
                    new_h[i] += take
                    if new_h[i] >= h_min:
                        ok = False
                        break
                if ok:
                    next_dp[(nd, *new_h)] += ways * comb(cnt, take)
        state_dp = next_dp

    losing = 0
    for state, ways in state_dp.items():
        need_out = drawn_count - state[0]
        if 0 <= need_out <= outside:
            losing += ways * comb(outside, need_out)
    return losing


def _compute_exact_union_for_simple_bets(
    *,
    universe_size: int,
    drawn_count: int,
    simple_bets: List[List[int]],
    effective_tiers: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Calcula a união probabilística exata (sem suposição de independência) para apostas simples explícitas."""
    q = len(simple_bets)
    total_space = comb(universe_size, drawn_count)
    bet_sets = [set(b) for b in simple_bets]
    prize_hits = sorted(int(t["hits"]) for t in effective_tiers)
    main_hits = next(
        (int(t["hits"]) for t in effective_tiers if t.get("is_main_prize")),
        max(prize_hits) if prize_hits else drawn_count,
    )
    secondary_hits = {h for h in prize_hits if h != main_hits}

    overlaps: List[int] = []
    for i in range(q):
        for j in range(i + 1, q):
            overlaps.append(len(bet_sets[i].intersection(bet_sets[j])))

    min_overlap = min(overlaps) if overlaps else 0
    max_overlap = max(overlaps) if overlaps else 0
    avg_overlap = (sum(overlaps) / len(overlaps)) if overlaps else 0.0
    disjoint_pairs = sum(1 for o in overlaps if o == 0)

    # Contagem exata da união de qualquer premiação
    if not prize_hits:
        any_raw_num = 0
    else:
        h_min = min(prize_hits)
        expected_contiguous = list(range(h_min, drawn_count + 1))
        if prize_hits == expected_contiguous:
            any_raw_num = total_space - _count_losing_draws_upward_closed(
                universe_size, drawn_count, bet_sets, h_min
            )
        else:
            # DP exato geral sobre átomos de Venn caso existam faixas não contíguas
            mask_counts: Dict[int, int] = defaultdict(int)
            for x in range(1, universe_size + 1):
                m = 0
                for i, bs in enumerate(bet_sets):
                    if x in bs:
                        m |= 1 << i
                mask_counts[m] += 1
            outside = mask_counts.pop(0, 0)
            atoms = list(mask_counts.items())
            prize_set = set(prize_hits)
            state_dp: Dict[Tuple[int, ...], int] = {(0,) * (q + 1): 1}
            for m, cnt in atoms:
                affected = [i for i in range(q) if (m & (1 << i))]
                next_dp: Dict[Tuple[int, ...], int] = defaultdict(int)
                for state, ways in state_dp.items():
                    d = state[0]
                    for take in range(min(cnt, drawn_count - d) + 1):
                        new_h = list(state[1:])
                        for i in affected:
                            new_h[i] += take
                        next_dp[(d + take, *new_h)] += ways * comb(cnt, take)
                state_dp = next_dp
            any_raw_num = 0
            for state, ways in state_dp.items():
                need_out = drawn_count - state[0]
                if 0 <= need_out <= outside and any(h in prize_set for h in state[1:]):
                    any_raw_num += ways * comb(outside, need_out)

    # Contagem exata de pelo menos um prêmio secundário:
    # Para faixas contíguas [h_min..drawn_count] com main_hits == drawn_count,
    # um sorteio está em W_any \ W_sec iff D == B_i e nenhum B_j (j != i) acerta em secondary_hits.
    if not secondary_hits:
        sec_raw_num = 0
    elif main_hits == drawn_count and prize_hits == list(range(min(prize_hits), drawn_count + 1)):
        excluded_top_only = 0
        for i in range(q):
            has_sec_with_other = any(
                j != i and len(bet_sets[i].intersection(bet_sets[j])) in secondary_hits
                for j in range(q)
            )
            if not has_sec_with_other:
                excluded_top_only += 1
        sec_raw_num = max(0, any_raw_num - excluded_top_only)
    else:
        mask_counts = defaultdict(int)
        for x in range(1, universe_size + 1):
            m = 0
            for i, bs in enumerate(bet_sets):
                if x in bs:
                    m |= 1 << i
            mask_counts[m] += 1
        outside = mask_counts.pop(0, 0)
        atoms = list(mask_counts.items())
        state_dp = {(0,) * (q + 1): 1}
        for m, cnt in atoms:
            affected = [i for i in range(q) if (m & (1 << i))]
            next_dp = defaultdict(int)
            for state, ways in state_dp.items():
                d = state[0]
                for take in range(min(cnt, drawn_count - d) + 1):
                    new_h = list(state[1:])
                    for i in affected:
                        new_h[i] += take
                    next_dp[(d + take, *new_h)] += ways * comb(cnt, take)
            state_dp = next_dp
        sec_raw_num = 0
        for state, ways in state_dp.items():
            need_out = drawn_count - state[0]
            if 0 <= need_out <= outside and any(h in secondary_hits for h in state[1:]):
                sec_raw_num += ways * comb(outside, need_out)

    any_frac = Fraction(any_raw_num, total_space)
    any_prob = float(Decimal(any_frac.numerator) / Decimal(any_frac.denominator))
    sec_frac = Fraction(sec_raw_num, total_space)
    sec_prob = float(Decimal(sec_frac.numerator) / Decimal(sec_frac.denominator))
    main_frac = Fraction(q if main_hits == drawn_count else 0, total_space)
    main_prob = float(Decimal(main_frac.numerator) / Decimal(main_frac.denominator))

    return {
        "games_count": q,
        "pairwise_overlap_summary": {
            "pair_count": len(overlaps),
            "min_overlap": min_overlap,
            "max_overlap": max_overlap,
            "avg_overlap": round(avg_overlap, 4),
            "disjoint_pairs_count": disjoint_pairs,
        },
        "main_prize_union": {
            "raw_numerator": str(q if main_hits == drawn_count else 0),
            "raw_denominator": str(total_space),
            "exact_numerator": str(main_frac.numerator),
            "exact_denominator": str(main_frac.denominator),
            "probability": main_prob,
            "scientific_notation": _format_decimal_scientific(main_frac),
            "odds_one_in": _rounded_odds_one_in(main_frac),
        },
        "any_prize_union": {
            "raw_numerator": str(any_raw_num),
            "raw_denominator": str(total_space),
            "exact_numerator": str(any_frac.numerator),
            "exact_denominator": str(any_frac.denominator),
            "probability": any_prob,
            "scientific_notation": _format_decimal_scientific(any_frac),
            "odds_one_in": _rounded_odds_one_in(any_frac),
            "memory": {
                "title": f"União Exata de Qualquer Premiação ({q} jogo(s) explícito(s))",
                "formula": "P(⋃ E_i) = |⋃_{i=1}^q {D : |D ∩ B_i| ∈ F}| / C(N, k)",
                "substituted_parameters": (
                    f"{any_raw_num} / {total_space} "
                    f"(pares: {len(overlaps)}, sobreposição mín/máx: {min_overlap}..{max_overlap})"
                ),
                "raw_numerator": str(any_raw_num),
                "raw_denominator": str(total_space),
                "simplified_fraction": f"{any_frac.numerator} / {any_frac.denominator}",
                "decimal_probability": any_prob,
                "percentage_formatted": _format_pct(any_prob),
                "scientific_notation": _format_decimal_scientific(any_frac),
                "odds_one_in": _rounded_odds_one_in(any_frac),
                "plain_explanation": (
                    f"Cálculo combinatório exato da união dos eventos vencedores considerando a estrutura real de interseções "
                    f"entre as {q} combinações informadas (sem assumir independência). "
                    f"Existem exatamente {any_raw_num} sorteios em {total_space} em que ao menos uma aposta é premiada."
                ),
            },
        },
        "secondary_prize_union": {
            "raw_numerator": str(sec_raw_num),
            "raw_denominator": str(total_space),
            "exact_numerator": str(sec_frac.numerator),
            "exact_denominator": str(sec_frac.denominator),
            "probability": sec_prob,
            "scientific_notation": _format_decimal_scientific(sec_frac),
            "odds_one_in": _rounded_odds_one_in(sec_frac),
            "memory": {
                "title": f"União Exata de Pelo Menos Um Prêmio Secundário ({q} jogo(s) explícito(s))",
                "formula": "P(⋃ E_sec,i) = |⋃_{i=1}^q {D : |D ∩ B_i| ∈ F_sec}| / C(N, k)",
                "substituted_parameters": (
                    f"{sec_raw_num} / {total_space} "
                    f"(faixas secundárias: {sorted(secondary_hits)}, sobreposição mín/máx: {min_overlap}..{max_overlap})"
                ),
                "raw_numerator": str(sec_raw_num),
                "raw_denominator": str(total_space),
                "simplified_fraction": f"{sec_frac.numerator} / {sec_frac.denominator}",
                "decimal_probability": sec_prob,
                "percentage_formatted": _format_pct(sec_prob),
                "scientific_notation": _format_decimal_scientific(sec_frac),
                "odds_one_in": _rounded_odds_one_in(sec_frac),
                "plain_explanation": (
                    f"Contagem exata de sorteios em que pelo menos uma das {q} apostas individuais atinge uma faixa secundária "
                    f"({sorted(secondary_hits)} acertos). A interseção entre os jogos altera diretamente o tamanho dessa união."
                ),
            },
        },
    }


class HypergeometricLotteryModel(BaseLotteryMathModel):
    """Modelo hipergeométrico exato para sorteio uniforme sem reposição em grupo único."""

    model_type = "hypergeometric_single_group"
    capabilities = ModelArchitectureCapabilities(
        model_type="hypergeometric_single_group",
        implemented=True,
        supports_multi_group=False,
        supports_positional=False,
        supports_extra_fields=False,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=True,
        description=(
            "Modelo combinatório hipergeométrico exato (aritmética racional arbitrária) "
            "para modalidades de universo único com apostas simples e múltiplas."
        ),
    )

    def compute_specialized(
        self,
        *,
        lottery_code: str,
        universe_size: int,
        drawn_count: int,
        chosen_count: int,
        min_numbers_to_choose: int,
        max_numbers_to_choose: int,
        prize_tiers: List[Dict[str, Any]],
        simple_bet_price_cents: Optional[int],
        price_updated_at: Optional[str],
        price_source: Optional[str],
        simple_games_count: Optional[int],
        simple_bets: Optional[List[List[int]]] = None,
    ) -> Dict[str, Any]:
        if chosen_count < min_numbers_to_choose or chosen_count > max_numbers_to_choose:
            raise ValueError(
                f"chosen_count={chosen_count} fora dos limites [{min_numbers_to_choose}, {max_numbers_to_choose}]."
            )

        effective_tiers = (
            list(prize_tiers)
            if prize_tiers
            else [
                {
                    "hits": min(drawn_count, chosen_count),
                    "tier_name": f"{min(drawn_count, chosen_count)} acertos",
                    "tier_order": 1,
                    "is_main_prize": True,
                }
            ]
        )
        tier_by_hits = {int(t["hits"]): t for t in effective_tiers}

        total_chosen = comb(universe_size, chosen_count)
        total_space_simple = comb(universe_size, drawn_count)
        max_hits = min(drawn_count, chosen_count)

        distribution_by_hits: Dict[str, Dict[str, Any]] = {}
        prize_tiers_out: List[Dict[str, Any]] = []

        any_prize_raw_num = 0
        any_prize_frac = Fraction(0, 1)
        winning_hits_terms: List[str] = []

        for h in range(0, max_hits + 1):
            base = hypergeometric_hit_detail(universe_size, drawn_count, chosen_count, h)
            tier = tier_by_hits.get(h)
            is_prize_tier = tier is not None
            embedded_wins = (
                _compute_embedded_simple_wins(chosen_count, drawn_count, h, effective_tiers)
                if is_prize_tier
                else []
            )

            if is_prize_tier and not base["is_impossible"]:
                any_prize_raw_num += int(base["raw_numerator"])
                any_prize_frac += Fraction(int(base["exact_numerator"]), int(base["exact_denominator"]))
                winning_hits_terms.append(f"P(X={h})")

            formula = "P(X = h) = [C(k, h) · C(N − k, m − h)] / C(N, m)"
            substituted = (
                f"P(X = {h}) = [C({drawn_count}, {h}) · C({universe_size - drawn_count}, {chosen_count - h})] "
                f"/ C({universe_size}, {chosen_count})"
            )
            if base["is_impossible"]:
                explanation = (
                    f"É matematicamente impossível obter {h} acertos escolhendo {chosen_count} dezenas "
                    f"em universo N={universe_size} com {drawn_count} sorteadas."
                )
            else:
                explanation = (
                    f"Há {base['raw_numerator']} combinações de {chosen_count} dezenas com exatamente "
                    f"{h} acertos dentre {base['raw_denominator']} combinações totais."
                )
                if embedded_wins and chosen_count > drawn_count:
                    desd_txt = " + ".join(
                        f"{w['winning_simple_combinations']}x {w['tier_name']}" for w in embedded_wins
                    )
                    explanation += f" No desdobramento, gera {desd_txt}."

            odds_one_in = (
                _rounded_odds_one_in(Fraction(int(base["exact_numerator"]), int(base["exact_denominator"])))
                if not base["is_impossible"]
                else None
            )

            point = {
                **base,
                "odds_one_in": odds_one_in,
                "tier_name": str(tier["tier_name"]) if tier else None,
                "is_prize_tier": is_prize_tier,
                "is_main_prize": bool(tier.get("is_main_prize", False)) if tier else False,
                "embedded_simple_wins": embedded_wins,
                "memory": {
                    "title": f"{tier['tier_name']} — Acerto exato no volante ({h} acertos)" if tier else f"{h} acertos no volante",
                    "formula": formula,
                    "substituted_parameters": substituted,
                    "raw_numerator": base["raw_numerator"],
                    "raw_denominator": base["raw_denominator"],
                    "simplified_fraction": f"{base['exact_numerator']} / {base['exact_denominator']}",
                    "decimal_probability": base["probability"],
                    "percentage_formatted": _format_pct(base["probability"]),
                    "scientific_notation": base["scientific_notation"],
                    "odds_one_in": odds_one_in,
                    "plain_explanation": explanation,
                },
            }
            distribution_by_hits[str(h)] = point
            if is_prize_tier:
                prize_tiers_out.append(point)

        # Separação B & C em prize_tiers_out:
        # C = P(obter pelo menos uma aposta simples premiada na faixa t) = sum_{h: w(h, t) > 0} P(H_volante = h)
        # B = quantidade esperada de apostas simples premiadas nessa faixa por sorteio = C(m, k) * P_simples(X = t)
        eq_simple_for_tiers = comb(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
        for tier_point in prize_tiers_out:
            t_hits = int(tier_point["hits"])
            triggering_hits: List[int] = []
            at_least_one_raw_num = 0
            at_least_one_frac = Fraction(0, 1)

            for h_str, d_point in distribution_by_hits.items():
                h_val = int(h_str)
                miss_needed = drawn_count - t_hits
                chosen_misses = chosen_count - h_val
                if t_hits <= h_val and 0 <= miss_needed <= chosen_misses:
                    embedded_cnt = comb(h_val, t_hits) * comb(chosen_misses, miss_needed)
                    if embedded_cnt > 0:
                        triggering_hits.append(h_val)
                        if not d_point["is_impossible"]:
                            at_least_one_raw_num += int(d_point["raw_numerator"])
                            at_least_one_frac += Fraction(
                                int(d_point["exact_numerator"]),
                                int(d_point["exact_denominator"]),
                            )

            triggering_hits.sort()
            at_least_prob = float(
                Decimal(at_least_one_frac.numerator) / Decimal(at_least_one_frac.denominator)
            )
            at_least_odds = _rounded_odds_one_in(at_least_one_frac)
            simple_t = hypergeometric_hit_detail(universe_size, drawn_count, drawn_count, t_hits)
            simple_t_frac = Fraction(int(simple_t["exact_numerator"]), int(simple_t["exact_denominator"]))
            expected_tier_wins = float(
                Decimal(eq_simple_for_tiers * simple_t_frac.numerator) / Decimal(simple_t_frac.denominator)
            )

            terms_txt = " + ".join(f"P(H_volante={h})" for h in triggering_hits) if triggering_hits else "0"
            tier_point["expected_embedded_wins_per_draw"] = expected_tier_wins
            tier_point["at_least_one_win"] = {
                "triggering_volante_hits": triggering_hits,
                "probability": at_least_prob,
                "raw_numerator": str(at_least_one_raw_num),
                "raw_denominator": str(total_chosen),
                "exact_numerator": str(at_least_one_frac.numerator),
                "exact_denominator": str(at_least_one_frac.denominator),
                "scientific_notation": _format_decimal_scientific(at_least_one_frac),
                "odds_one_in": at_least_odds,
                "precision_classification": (
                    "exact"
                    if at_least_one_frac.numerator in (0, at_least_one_frac.denominator)
                    else "exact_rational_with_float_approximation"
                ),
                "memory": {
                    "title": f"P(Pelo menos 1 prêmio em {tier_point['tier_name']})",
                    "formula": "P(≥ 1 aposta na faixa t) = Σ P(H_volante = h) para todo h com C(h, t)·C(m − h, k − t) > 0",
                    "substituted_parameters": f"{terms_txt} = {at_least_one_raw_num} / {total_chosen}",
                    "raw_numerator": str(at_least_one_raw_num),
                    "raw_denominator": str(total_chosen),
                    "simplified_fraction": f"{at_least_one_frac.numerator} / {at_least_one_frac.denominator}",
                    "decimal_probability": at_least_prob,
                    "percentage_formatted": _format_pct(at_least_prob),
                    "scientific_notation": _format_decimal_scientific(at_least_one_frac),
                    "odds_one_in": at_least_odds,
                    "plain_explanation": (
                        f"Em um volante de {chosen_count} dezenas, a faixa '{tier_point['tier_name']}' ({t_hits} acertos) "
                        f"é premiada em pelo menos uma aposta simples embutida sempre que o volante acerta h ∈ {triggering_hits} "
                        f"dezenas sorteadas. Isso totaliza {at_least_one_raw_num} de {total_chosen} combinações possíveis."
                    ),
                },
            }

        prize_tiers_out.sort(key=lambda item: int(item["hits"]), reverse=True)

        any_prob_float = float(Decimal(any_prize_frac.numerator) / Decimal(any_prize_frac.denominator))
        any_odds = _rounded_odds_one_in(any_prize_frac)
        no_prize_frac = Fraction(1, 1) - any_prize_frac
        no_prize_raw_num = total_chosen - any_prize_raw_num
        no_prob_float = float(Decimal(no_prize_frac.numerator) / Decimal(no_prize_frac.denominator))
        no_odds = _rounded_odds_one_in(no_prize_frac)

        any_prize_obj = {
            "label": "Probabilidade de Premiação (qualquer faixa oficial)",
            "probability": any_prob_float,
            "raw_numerator": str(any_prize_raw_num),
            "raw_denominator": str(total_chosen),
            "exact_numerator": str(any_prize_frac.numerator),
            "exact_denominator": str(any_prize_frac.denominator),
            "scientific_notation": _format_decimal_scientific(any_prize_frac),
            "odds_one_in": any_odds,
            "precision_classification": (
                "exact"
                if any_prize_frac.numerator in (0, any_prize_frac.denominator)
                else "exact_rational_with_float_approximation"
            ),
            "memory": {
                "title": "Probabilidade de Obter Alguma Premiação",
                "formula": "P(Premiação) = Σ P(X = h) para toda faixa h premiada",
                "substituted_parameters": "P(Premiação) = " + " + ".join(winning_hits_terms),
                "raw_numerator": str(any_prize_raw_num),
                "raw_denominator": str(total_chosen),
                "simplified_fraction": f"{any_prize_frac.numerator} / {any_prize_frac.denominator}",
                "decimal_probability": any_prob_float,
                "percentage_formatted": _format_pct(any_prob_float),
                "scientific_notation": _format_decimal_scientific(any_prize_frac),
                "odds_one_in": any_odds,
                "plain_explanation": (
                    f"Soma exata de todas as faixas premiadas: {any_prize_raw_num} combinações favoráveis "
                    f"entre {total_chosen} possíveis."
                ),
            },
        }

        no_prize_obj = {
            "label": "Probabilidade de Não Obter Premiação",
            "probability": no_prob_float,
            "raw_numerator": str(no_prize_raw_num),
            "raw_denominator": str(total_chosen),
            "exact_numerator": str(no_prize_frac.numerator),
            "exact_denominator": str(no_prize_frac.denominator),
            "scientific_notation": _format_decimal_scientific(no_prize_frac),
            "odds_one_in": no_odds,
            "precision_classification": (
                "exact"
                if no_prize_frac.numerator in (0, no_prize_frac.denominator)
                else "exact_rational_with_float_approximation"
            ),
            "memory": {
                "title": "Probabilidade de Não Premiar",
                "formula": "P(Sem Prêmio) = 1 − P(Premiação)",
                "substituted_parameters": (
                    f"1 − ({any_prize_frac.numerator} / {any_prize_frac.denominator}) = "
                    f"{no_prize_frac.numerator} / {no_prize_frac.denominator}"
                ),
                "raw_numerator": str(no_prize_raw_num),
                "raw_denominator": str(total_chosen),
                "simplified_fraction": f"{no_prize_frac.numerator} / {no_prize_frac.denominator}",
                "decimal_probability": no_prob_float,
                "percentage_formatted": _format_pct(no_prob_float),
                "scientific_notation": _format_decimal_scientific(no_prize_frac),
                "odds_one_in": no_odds,
                "plain_explanation": (
                    f"Complemento exato: {no_prize_raw_num} combinações de {total_chosen} não atingem premiação."
                ),
            },
        }

        # Aposta simples vs múltipla
        equivalent_simple = comb(chosen_count, drawn_count) if chosen_count >= drawn_count else 0
        total_cost_cents = (
            str(equivalent_simple * simple_bet_price_cents)
            if simple_bet_price_cents is not None
            else None
        )
        cov_frac = Fraction(equivalent_simple, total_space_simple)
        cov_float = float(Decimal(cov_frac.numerator) / Decimal(cov_frac.denominator))

        multiple_bet_obj = {
            "chosen_count": chosen_count,
            "drawn_count": drawn_count,
            "is_multiple_bet": chosen_count > drawn_count,
            "equivalent_simple_bets": str(equivalent_simple),
            "simple_bet_price_cents": simple_bet_price_cents,
            "total_cost_cents": total_cost_cents,
            "price_updated_at": price_updated_at,
            "price_source": price_source,
            "combinatorial_coverage": {
                "numerator": str(equivalent_simple),
                "denominator": str(total_space_simple),
                "simplified_numerator": str(cov_frac.numerator),
                "simplified_denominator": str(cov_frac.denominator),
                "probability": cov_float,
                "scientific_notation": _format_decimal_scientific(cov_frac),
                "odds_one_in": _rounded_odds_one_in(cov_frac),
            },
        }

        # Comparação contra q jogos simples distintos (sem suposição falsa de independência como resultado exato)
        max_q = min(total_space_simple, 1_000_000)
        if simple_bets is not None:
            q = len(simple_bets)
        else:
            q = simple_games_count if simple_games_count is not None else min(max(equivalent_simple, 1), 100_000)
            q = max(1, min(q, max_q))

        simple_any_frac = Fraction(0, 1)
        simple_sec_frac = Fraction(0, 1)
        for tier in effective_tiers:
            t_hits = int(tier["hits"])
            t_detail = hypergeometric_hit_detail(universe_size, drawn_count, drawn_count, t_hits)
            if not t_detail["is_impossible"]:
                t_f = Fraction(
                    int(t_detail["exact_numerator"]),
                    int(t_detail["exact_denominator"]),
                )
                simple_any_frac += t_f
                if not tier.get("is_main_prize") and t_hits != drawn_count:
                    simple_sec_frac += t_f
        simple_any_float = float(Decimal(simple_any_frac.numerator) / Decimal(simple_any_frac.denominator))
        simple_sec_float = float(Decimal(simple_sec_frac.numerator) / Decimal(simple_sec_frac.denominator))

        q_top_frac = Fraction(q, total_space_simple)
        q_top_float = float(Decimal(q_top_frac.numerator) / Decimal(q_top_frac.denominator))

        exact_union_analysis = (
            _compute_exact_union_for_simple_bets(
                universe_size=universe_size,
                drawn_count=drawn_count,
                simple_bets=simple_bets,
                effective_tiers=effective_tiers,
            )
            if simple_bets is not None
            else None
        )

        overlap_notice = (
            "A probabilidade exata de obter pelo menos um prêmio secundário (ou ao menos um prêmio total) "
            "depende da sobreposição entre os jogos escolhidos e não pode ser determinada apenas pela quantidade q. "
            "Informe as combinações individuais para calcular a união exata dos eventos."
        )

        simple_games_obj = {
            "simple_games_count": q,
            "simple_bet_price_cents": simple_bet_price_cents,
            "total_cost_cents": str(q * simple_bet_price_cents) if simple_bet_price_cents is not None else None,
            "top_prize_exact": {
                "numerator": str(q),
                "denominator": str(total_space_simple),
                "simplified_numerator": str(q_top_frac.numerator),
                "simplified_denominator": str(q_top_frac.denominator),
                "probability": q_top_float,
                "scientific_notation": _format_decimal_scientific(q_top_frac),
                "odds_one_in": _rounded_odds_one_in(q_top_frac),
            },
            "expected_winning_games_per_draw": q * simple_any_float,
            "expected_secondary_winning_games_per_draw": q * simple_sec_float,
            "secondary_prize_status": (
                "exact_union_computed" if exact_union_analysis is not None else "requires_explicit_combinations"
            ),
            "overlap_dependency_notice": overlap_notice,
            "exact_union_analysis": exact_union_analysis,
            "illustrative_independent_approximation": {
                "value": 1.0 - (1.0 - simple_any_float) ** q,
                "is_exact": False,
                "warning": (
                    "Aproximação ilustrativa sob hipótese falsa de independência (1 − (1 − p)^q). "
                    "Apostas no mesmo concurso compartilham o sorteio e dependem da sobreposição combinatória; "
                    "não representa probabilidade matemática exata."
                ),
            },
            "equiprobability_notice": (
                "Em sorteios justos e independentes, combinações individuais distintas possuem exatamente "
                "a mesma probabilidade matemática (1 / C(N, k))."
            ),
        }

        # Matriz comparativa para m in [min..max]
        main_hits = next(
            (int(t["hits"]) for t in effective_tiers if t.get("is_main_prize")),
            min(drawn_count, max_numbers_to_choose),
        )
        min_eq = comb(min_numbers_to_choose, drawn_count) if min_numbers_to_choose >= drawn_count else 1
        comparison_rows: List[Dict[str, Any]] = []
        for m in range(min_numbers_to_choose, max_numbers_to_choose + 1):
            eq_simple = comb(m, drawn_count) if m >= drawn_count else 0
            m_space = comb(universe_size, m)
            main_pt = hypergeometric_hit_detail(universe_size, drawn_count, m, main_hits)
            main_frac = Fraction(int(main_pt["exact_numerator"]), int(main_pt["exact_denominator"]))

            m_any_frac = Fraction(0, 1)
            for tier in effective_tiers:
                tp = hypergeometric_hit_detail(universe_size, drawn_count, m, int(tier["hits"]))
                if not tp["is_impossible"]:
                    m_any_frac += Fraction(int(tp["exact_numerator"]), int(tp["exact_denominator"]))
            m_any_float = float(Decimal(m_any_frac.numerator) / Decimal(m_any_frac.denominator))
            factor = eq_simple / min_eq if min_eq > 0 else 0.0
            comparison_rows.append(
                {
                    "chosen_count": m,
                    "is_selected": m == chosen_count,
                    "equivalent_simple_bets": str(eq_simple),
                    "total_cost_cents": (
                        str(eq_simple * simple_bet_price_cents)
                        if simple_bet_price_cents is not None
                        else None
                    ),
                    "total_space_combinations": str(m_space),
                    "main_prize_hits": main_hits,
                    "main_prize_probability": main_pt["probability"],
                    "main_prize_odds_one_in": _rounded_odds_one_in(main_frac),
                    "any_prize_probability": m_any_float,
                    "any_prize_odds_one_in": _rounded_odds_one_in(m_any_frac),
                    "no_prize_probability": max(0.0, 1.0 - m_any_float),
                    "coverage_factor_vs_minimum": f"{factor:.2f}x",
                }
            )

        dist_sum = sum(float(v["probability"]) for v in distribution_by_hits.values())

        return {
            "lottery_code": lottery_code,
            "math_model_type": self.model_type,
            "universe_size": universe_size,
            "drawn_count": drawn_count,
            "chosen_count": chosen_count,
            "total_space_simple_combinations": str(total_space_simple),
            "total_combinations": str(total_chosen),
            "distribution_by_hits": distribution_by_hits,
            "distribution_sum": dist_sum,
            "distribution_sum_tolerance": DISTRIBUTION_SUM_TOLERANCE,
            "prize_tiers": prize_tiers_out,
            "any_prize": any_prize_obj,
            "no_prize": no_prize_obj,
            "multiple_bet": multiple_bet_obj,
            "simple_games_comparison": simple_games_obj,
            "comparison_rows": comparison_rows,
            "axiom_notice": INDEPENDENCE_AXIOM_STATEMENT,
            "execution_source": "python_fastapi_engine",
            "engine_status": "verified_combinatorics",
        }


class MegaSenaMathModel(HypergeometricLotteryModel):
    """Especialização documental para Mega-Sena (N=60, k=6, m∈[6..20], Sena/Quina/Quadra)."""

    model_type = "hypergeometric_single_group"
    capabilities = ModelArchitectureCapabilities(
        model_type="hypergeometric_single_group",
        implemented=True,
        supports_multi_group=False,
        supports_positional=False,
        supports_extra_fields=False,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=True,
        description="Modelo especializado Mega-Sena (60 dezenas, 6 sorteadas, Sena/Quina/Quadra e Mega da Virada).",
    )


class LotofacilMathModel(HypergeometricLotteryModel):
    """Especialização documental para Lotofácil (N=25, k=15, m∈[15..20], 11 a 15 acertos)."""

    model_type = "hypergeometric_single_group"
    capabilities = ModelArchitectureCapabilities(
        model_type="hypergeometric_single_group",
        implemented=True,
        supports_multi_group=False,
        supports_positional=False,
        supports_extra_fields=False,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=True,
        description="Modelo especializado Lotofácil (25 dezenas, 15 sorteadas, 11–15 acertos e Lotofácil da Independência).",
    )
