"""Registro central de modelos matemáticos por modalidade e tipo estrutural."""

from typing import Dict, List

from .base import BaseLotteryMathModel
from .hypergeometric import HypergeometricLotteryModel, LotofacilMathModel, MegaSenaMathModel
from .prepared import (
    ExtraFieldCombinatorialModel,
    MultiExtractionModel,
    MultiGroupCombinatorialModel,
    PositionalColumnsModel,
)

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


def resolve_lottery_model(lottery_code: str, math_model_type: str = "hypergeometric_single_group") -> BaseLotteryMathModel:
    if lottery_code in MODEL_BY_LOTTERY_CODE and math_model_type == "hypergeometric_single_group":
        return MODEL_BY_LOTTERY_CODE[lottery_code]
    if math_model_type in MODEL_REGISTRY:
        return MODEL_REGISTRY[math_model_type]
    raise ValueError(f"Modelo matemático desconhecido: '{math_model_type}'.")


def list_registered_models() -> List[Dict[str, object]]:
    return [model.capabilities.to_dict() for model in MODEL_REGISTRY.values()]
