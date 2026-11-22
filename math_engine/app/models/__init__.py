"""Modelos matemáticos especializados por modalidade — LOTUS AI."""

from .base import BaseLotteryMathModel, ModelArchitectureCapabilities
from .hypergeometric import HypergeometricLotteryModel, LotofacilMathModel, MegaSenaMathModel
from .prepared import (
    ExtraFieldCombinatorialModel,
    MultiExtractionModel,
    MultiGroupCombinatorialModel,
    PositionalColumnsModel,
)
from .registry import (
    MODEL_REGISTRY,
    REGISTERED_LOTTERY_SPECS,
    UnregisteredLotteryError,
    list_registered_models,
    resolve_lottery_model,
    validate_specialized_lottery_params,
)

__all__ = [
    "BaseLotteryMathModel",
    "ModelArchitectureCapabilities",
    "HypergeometricLotteryModel",
    "MegaSenaMathModel",
    "LotofacilMathModel",
    "MultiGroupCombinatorialModel",
    "PositionalColumnsModel",
    "ExtraFieldCombinatorialModel",
    "MultiExtractionModel",
    "MODEL_REGISTRY",
    "REGISTERED_LOTTERY_SPECS",
    "UnregisteredLotteryError",
    "list_registered_models",
    "resolve_lottery_model",
    "validate_specialized_lottery_params",
]
