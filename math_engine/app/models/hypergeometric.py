"""Modelos hipergeométricos especializados para modalidades de grupo único (Mega-Sena, Lotofácil, etc.)."""

from decimal import Decimal
from fractions import Fraction
from math import comb
from typing import Any, Dict, List, Optional

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
                    "title": f"{tier['tier_name']} ({h} acertos)" if tier else f"{h} acertos",
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

        # Comparação contra q jogos simples distintos
        max_q = min(total_space_simple, 1_000_000)
        q = simple_games_count if simple_games_count is not None else min(max(equivalent_simple, 1), 100_000)
        q = max(1, min(q, max_q))

        simple_any_frac = Fraction(0, 1)
        for tier in effective_tiers:
            t_detail = hypergeometric_hit_detail(universe_size, drawn_count, drawn_count, int(tier["hits"]))
            if not t_detail["is_impossible"]:
                simple_any_frac += Fraction(
                    int(t_detail["exact_numerator"]),
                    int(t_detail["exact_denominator"]),
                )
        simple_any_float = float(Decimal(simple_any_frac.numerator) / Decimal(simple_any_frac.denominator))

        q_top_frac = Fraction(q, total_space_simple)
        q_top_float = float(Decimal(q_top_frac.numerator) / Decimal(q_top_frac.denominator))
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
            "independent_model_any_prize_probability": 1.0 - (1.0 - simple_any_float) ** q,
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
