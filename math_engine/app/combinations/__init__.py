"""Módulo Python do Laboratório Avançado de Combinações (Etapa 3 — LOTUS AI)."""

from .combinatorics_ops import (
    analyze_bet_set,
    analyze_constrained_universe,
    compare_strategies,
)
from .coverage import analyze_subset_coverage
from .generator import generate_controlled_bets

__all__ = [
    "analyze_bet_set",
    "analyze_constrained_universe",
    "analyze_subset_coverage",
    "compare_strategies",
    "generate_controlled_bets",
]
