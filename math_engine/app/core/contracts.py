"""Contratos Pydantic estritos para o Motor Matemático LOTUS AI."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator


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


class PrizeTierInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hits: StrictInt = Field(..., ge=0, le=1000)
    tier_name: StrictStr = Field(..., min_length=1, max_length=80)
    tier_order: StrictInt = Field(..., ge=1, le=100)
    is_main_prize: StrictBool = False


class SpecializedProbabilityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lottery_code: StrictStr = Field(..., min_length=2, max_length=64)
    math_model_type: Literal[
        "hypergeometric_single_group",
        "multi_group_combinatorial",
        "positional_columns",
        "multi_extraction",
        "extra_field_combinatorial",
    ] = "hypergeometric_single_group"
    universe_size: StrictInt = Field(..., ge=1, le=1000)
    drawn_count: StrictInt = Field(..., ge=0, le=1000)
    chosen_count: StrictInt = Field(..., ge=0, le=1000)
    min_numbers_to_choose: Optional[StrictInt] = Field(default=None, ge=1, le=1000)
    max_numbers_to_choose: Optional[StrictInt] = Field(default=None, ge=1, le=1000)
    prize_tiers: List[PrizeTierInput] = Field(default_factory=list)
    simple_bet_price_cents: Optional[StrictInt] = Field(default=None, ge=0, le=10_000_000)
    price_updated_at: Optional[StrictStr] = Field(default=None, max_length=64)
    price_source: Optional[StrictStr] = Field(default=None, max_length=512)
    simple_games_count: Optional[StrictInt] = Field(default=None, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def validate_bounds(self) -> "SpecializedProbabilityRequest":
        cleaned_code = self.lottery_code.strip()
        if len(cleaned_code) < 2:
            raise ValueError("lottery_code deve conter ao menos 2 caracteres válidos.")
        self.lottery_code = cleaned_code

        if self.drawn_count > self.universe_size:
            raise ValueError("drawn_count deve ser <= universe_size.")
        if self.chosen_count > self.universe_size:
            raise ValueError("chosen_count deve ser <= universe_size.")

        eff_min = self.min_numbers_to_choose if self.min_numbers_to_choose is not None else self.chosen_count
        eff_max = self.max_numbers_to_choose if self.max_numbers_to_choose is not None else self.chosen_count

        if eff_max < eff_min:
            raise ValueError("max_numbers_to_choose deve ser >= min_numbers_to_choose.")
        if eff_max > self.universe_size:
            raise ValueError("max_numbers_to_choose deve ser <= universe_size.")
        if self.chosen_count < eff_min or self.chosen_count > eff_max:
            raise ValueError("chosen_count fora do intervalo [min_numbers_to_choose, max_numbers_to_choose].")

        for tier in self.prize_tiers:
            if tier.hits > self.drawn_count:
                raise ValueError(f"Faixa '{tier.tier_name}' possui hits={tier.hits} maior que drawn_count={self.drawn_count}.")

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
