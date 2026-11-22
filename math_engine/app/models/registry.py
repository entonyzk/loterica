"""Registro central de modelos matemáticos por modalidade e tipo estrutural."""

from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Optional

from .base import BaseLotteryMathModel
from .hypergeometric import HypergeometricLotteryModel, LotofacilMathModel, MegaSenaMathModel
from .prepared import (
    ExtraFieldCombinatorialModel,
    MultiExtractionModel,
    MultiGroupCombinatorialModel,
    PositionalColumnsModel,
)


class UnregisteredLotteryError(LookupError):
    """Modalidade não cadastrada no registro oficial do motor especializado."""


@dataclass(frozen=True)
class RegisteredLotterySpec:
    code: str
    math_model_type: str
    implemented: bool
    universe_size: Optional[int] = None
    drawn_count: Optional[int] = None
    min_numbers_to_choose: Optional[int] = None
    max_numbers_to_choose: Optional[int] = None
    official_prize_hits: Optional[FrozenSet[int]] = None


REGISTERED_LOTTERY_SPECS: Dict[str, RegisteredLotterySpec] = {
    "mega-sena": RegisteredLotterySpec(
        code="mega-sena",
        math_model_type="hypergeometric_single_group",
        implemented=True,
        universe_size=60,
        drawn_count=6,
        min_numbers_to_choose=6,
        max_numbers_to_choose=20,
        official_prize_hits=frozenset({4, 5, 6}),
    ),
    "lotofacil": RegisteredLotterySpec(
        code="lotofacil",
        math_model_type="hypergeometric_single_group",
        implemented=True,
        universe_size=25,
        drawn_count=15,
        min_numbers_to_choose=15,
        max_numbers_to_choose=20,
        official_prize_hits=frozenset({11, 12, 13, 14, 15}),
    ),
    # Modalidades catalogadas aguardando verificação documental de regras na Etapa 2+
    "quina": RegisteredLotterySpec(code="quina", math_model_type="hypergeometric_single_group", implemented=False),
    "lotomania": RegisteredLotterySpec(code="lotomania", math_model_type="hypergeometric_single_group", implemented=False),
    "timemania": RegisteredLotterySpec(code="timemania", math_model_type="extra_field_combinatorial", implemented=False),
    "dupla-sena": RegisteredLotterySpec(code="dupla-sena", math_model_type="multi_extraction", implemented=False),
    "dia-de-sorte": RegisteredLotterySpec(code="dia-de-sorte", math_model_type="extra_field_combinatorial", implemented=False),
    "super-sete": RegisteredLotterySpec(code="super-sete", math_model_type="positional_columns", implemented=False),
}

MODEL_BY_LOTTERY_CODE: Dict[str, BaseLotteryMathModel] = {
    "mega-sena": MegaSenaMathModel(),
    "lotofacil": LotofacilMathModel(),
}

MODEL_REGISTRY: Dict[str, BaseLotteryMathModel] = {
    "hypergeometric_single_group": HypergeometricLotteryModel(),
    "multi_group_combinatorial": MultiGroupCombinatorialModel(),
    "positional_columns": PositionalColumnsModel(),
    "extra_field_combinatorial": ExtraFieldCombinatorialModel(),
    "multi_extraction": MultiExtractionModel(),
}


def validate_specialized_lottery_params(
    *,
    lottery_code: str,
    math_model_type: str,
    universe_size: int,
    drawn_count: int,
    chosen_count: int,
    min_numbers_to_choose: int,
    max_numbers_to_choose: int,
    prize_tiers: List[Dict[str, object]],
) -> RegisteredLotterySpec:
    spec = REGISTERED_LOTTERY_SPECS.get(lottery_code)
    if spec is None:
        raise UnregisteredLotteryError(
            f"Modalidade '{lottery_code}' não está cadastrada no motor especializado. "
            "Códigos genéricos ou inventados devem utilizar /v1/probabilities/theoretical."
        )

    if math_model_type != spec.math_model_type:
        raise ValueError(
            f"Modelo matemático '{math_model_type}' incompatível com a modalidade '{lottery_code}' "
            f"(esperado: '{spec.math_model_type}')."
        )

    if not spec.implemented:
        raise NotImplementedError(
            f"Modalidade '{lottery_code}' aguarda configuração oficial verificada antes da execução especializada."
        )

    if spec.universe_size is not None and universe_size != spec.universe_size:
        raise ValueError(
            f"Universo numérico universe_size={universe_size} incompatível com '{lottery_code}' "
            f"(oficial: {spec.universe_size})."
        )
    if spec.drawn_count is not None and drawn_count != spec.drawn_count:
        raise ValueError(
            f"Quantidade sorteada drawn_count={drawn_count} incompatível com '{lottery_code}' "
            f"(oficial: {spec.drawn_count})."
        )
    if spec.min_numbers_to_choose is not None and min_numbers_to_choose < spec.min_numbers_to_choose:
        raise ValueError(
            f"Limite mínimo min_numbers_to_choose={min_numbers_to_choose} inválido para '{lottery_code}' "
            f"(oficial mínimo: {spec.min_numbers_to_choose})."
        )
    if spec.max_numbers_to_choose is not None and max_numbers_to_choose > spec.max_numbers_to_choose:
        raise ValueError(
            f"Limite máximo max_numbers_to_choose={max_numbers_to_choose} excede o teto oficial de '{lottery_code}' "
            f"({spec.max_numbers_to_choose})."
        )
    if spec.min_numbers_to_choose is not None and spec.max_numbers_to_choose is not None:
        if chosen_count < spec.min_numbers_to_choose or chosen_count > spec.max_numbers_to_choose:
            raise ValueError(
                f"chosen_count={chosen_count} fora dos limites oficiais [{spec.min_numbers_to_choose}..{spec.max_numbers_to_choose}] "
                f"para '{lottery_code}'."
            )

    if spec.official_prize_hits is not None and prize_tiers:
        provided_hits = {int(t["hits"]) for t in prize_tiers}
        if provided_hits != spec.official_prize_hits:
            raise ValueError(
                f"Faixas de premiação informadas ({sorted(provided_hits)}) divergem das faixas oficiais de '{lottery_code}' "
                f"({sorted(spec.official_prize_hits)})."
            )

    return spec


def resolve_lottery_model(lottery_code: str, math_model_type: str = "hypergeometric_single_group") -> BaseLotteryMathModel:
    spec = REGISTERED_LOTTERY_SPECS.get(lottery_code)
    if spec is None:
        raise UnregisteredLotteryError(
            f"Modalidade '{lottery_code}' não está cadastrada no motor especializado."
        )
    if math_model_type != spec.math_model_type:
        raise ValueError(
            f"Modelo '{math_model_type}' incompatível com '{lottery_code}' (esperado: '{spec.math_model_type}')."
        )
    if not spec.implemented:
        return MODEL_REGISTRY[spec.math_model_type]
    if lottery_code in MODEL_BY_LOTTERY_CODE:
        return MODEL_BY_LOTTERY_CODE[lottery_code]
    raise UnregisteredLotteryError(f"Modelo especializado indisponível para '{lottery_code}'.")


def list_registered_models() -> List[Dict[str, object]]:
    return [model.capabilities.to_dict() for model in MODEL_REGISTRY.values()]
