"""Interface base e capacidades estruturais dos modelos matemáticos por modalidade."""

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class ModelArchitectureCapabilities:
    model_type: str
    implemented: bool
    supports_multi_group: bool
    supports_positional: bool
    supports_extra_fields: bool
    supports_multi_extraction: bool
    supports_prize_tiers: bool
    supports_special_events: bool
    description: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class BaseLotteryMathModel(ABC):
    """Classe base para modelos combinatórios especializados por modalidade."""

    model_type: str
    capabilities: ModelArchitectureCapabilities

    @abstractmethod
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
        """Executa o cálculo probabilístico completo da modalidade."""
        raise NotImplementedError
