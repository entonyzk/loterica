"""Contratos Pydantic para o Motor Matemático LOTUS AI."""

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


class TheoreticalProbabilityRequest(BaseModel):
    lottery_code: str = Field(..., min_length=2)
    universe_size: int = Field(..., ge=1, le=1000)
    drawn_count: int = Field(..., ge=0, le=1000)
    chosen_count: int = Field(..., ge=0, le=1000)


class HitProbabilityDetail(BaseModel):
    hits: int
    probability: float
    raw_numerator: str
    raw_denominator: str
    exact_numerator: str
    exact_denominator: str
    scientific_notation: str
    is_impossible: bool
    precision_classification: Literal["exact", "exact_rational_with_float_approximation"]


class TheoreticalProbabilityResponse(BaseModel):
    lottery_code: str
    universe_size: int
    drawn_count: int
    chosen_count: int
    total_combinations: str
    distribution_by_hits: Dict[str, HitProbabilityDetail]
    distribution_sum: float
    distribution_sum_tolerance: float
    axiom_notice: str
    execution_source: Literal["python_fastapi_engine"]
    engine_status: Literal["verified_combinatorics"]


class PlannedTaskContract(BaseModel):
    module: Literal["statistics", "simulations", "backtesting", "closing", "generator"]
    stage_target: str
    implemented: bool = False
    description: str
    required_libraries: list[str]
    input_schema: Dict[str, Any]
    output_schema: Optional[Dict[str, Any]] = None
