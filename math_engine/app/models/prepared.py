"""Modelos estruturais preparados para futuras modalidades com arquiteturas distintas."""

from typing import Any, Dict, List, Optional

from .base import BaseLotteryMathModel, ModelArchitectureCapabilities


class _PreparedUnverifiedModel(BaseLotteryMathModel):
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
        raise NotImplementedError(
            f"O modelo estrutural '{self.model_type}' para '{lottery_code}' está preparado na arquitetura, "
            "mas aguarda verificação documental oficial das regras antes de executar cálculos."
        )


class MultiGroupCombinatorialModel(_PreparedUnverifiedModel):
    model_type = "multi_group_combinatorial"
    capabilities = ModelArchitectureCapabilities(
        model_type="multi_group_combinatorial",
        implemented=False,
        supports_multi_group=True,
        supports_positional=False,
        supports_extra_fields=False,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=True,
        description="Modelo preparado para sorteios em múltiplos grupos independentes de dezenas (ex.: +Milionária).",
    )


class PositionalColumnsModel(_PreparedUnverifiedModel):
    model_type = "positional_columns"
    capabilities = ModelArchitectureCapabilities(
        model_type="positional_columns",
        implemented=False,
        supports_multi_group=True,
        supports_positional=True,
        supports_extra_fields=False,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=False,
        description="Modelo preparado para sorteios posicionais por colunas (ex.: Super Sete).",
    )


class ExtraFieldCombinatorialModel(_PreparedUnverifiedModel):
    model_type = "extra_field_combinatorial"
    capabilities = ModelArchitectureCapabilities(
        model_type="extra_field_combinatorial",
        implemented=False,
        supports_multi_group=False,
        supports_positional=False,
        supports_extra_fields=True,
        supports_multi_extraction=False,
        supports_prize_tiers=True,
        supports_special_events=False,
        description="Modelo preparado para modalidades com campo adicional independente (ex.: Timemania, Dia de Sorte).",
    )


class MultiExtractionModel(_PreparedUnverifiedModel):
    model_type = "multi_extraction"
    capabilities = ModelArchitectureCapabilities(
        model_type="multi_extraction",
        implemented=False,
        supports_multi_group=False,
        supports_positional=False,
        supports_extra_fields=False,
        supports_multi_extraction=True,
        supports_prize_tiers=True,
        supports_special_events=True,
        description="Modelo preparado para modalidades com duas ou mais extrações por concurso (ex.: Dupla Sena).",
    )
