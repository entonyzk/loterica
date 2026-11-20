"""Contratos Pydantic estritos para o Motor Matemático LOTUS AI."""

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, model_validator


class TheoreticalProbabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lottery_code: StrictStr = Field(..., min_length=2, max_length=64)
    universe_size: StrictInt = Field(..., ge=1, le=1000)
    drawn_count: StrictInt = Field(..., ge=0, le=1000)
    chosen_count: StrictInt = Field(..., ge=0, le=1000)

    @model_validator(mode="after")
    def validate_mathematical_bounds(self) -> "TheoreticalProbabilityRequest":
        cleaned_code = self.lottery_code.strip()
        if len(cleaned_code) < 2:
            raise ValueError("lottery_code deve conter ao menos 2 caracteres válidos.")
        self.lottery_code = cleaned_code
        if self.drawn_count > self.universe_size:
            raise ValueError("drawn_count deve ser <= universe_size.")
        if self.chosen_count > self.universe_size:
            raise ValueError("chosen_count deve ser <= universe_size.")
        return self


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
