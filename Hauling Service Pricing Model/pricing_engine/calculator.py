"""
Main pricing calculator for the dump-trailer towing service.
"""

from typing import Optional
from .constants import (
    BASE_FEE, 
    MILE_RATE, 
    LABOR_RATE, 
    DUMP_PROCESSING_FEE,
    MATTRESS_FEE,
    APPLIANCE_FEE,
    TIRE_FEE
)
from .mileage import MileageCalculator, MileageCalculationError


class PricingError(Exception):
    """Raised when pricing calculation fails."""
    pass


class JobPriceResult:
    """
    Structured result object for job pricing.
    Contains all cost components and the total price.
    """
    
    def __init__(
        self,
        total_miles: float,
        base_fee: float,
        mileage_cost: float,
        labor_cost: float,
        dump_cost: float,
        surcharges: float,
        total_price: float,
        route_details: Optional[dict] = None
    ):
        self.total_miles = total_miles
        self.base_fee = base_fee
        self.mileage_cost = mileage_cost
        self.labor_cost = labor_cost
        self.dump_cost = dump_cost
        self.surcharges = surcharges
        self.total_price = total_price
        self.route_details = route_details
    
    def to_dict(self) -> dict:
        """Convert result to dictionary format."""
        result = {
            "total_miles": self.total_miles,
            "base_fee": self.base_fee,
            "mileage_cost": self.mileage_cost,
            "labor_cost": self.labor_cost,
            "dump_cost": self.dump_cost,
            "surcharges": self.surcharges,
            "total_price": self.total_price
        }
        if self.route_details:
            result["route_details"] = self.route_details
        return result
    
    def __repr__(self) -> str:
        return (
            f"JobPriceResult(total_miles={self.total_miles}, "
            f"total_price=${self.total_price:.2f})"
        )


def calculate_job_price(
    start_address: str,
    pickup_address: str,
    dump_address: str,
    return_address: str,
    labor_hours: float,
    dump_fee: float,
    num_mattresses: int = 0,
    num_appliances: int = 0,
    num_tires: int = 0,
    api_key: Optional[str] = None,
    use_mock: bool = False,
    include_route_details: bool = False
) -> JobPriceResult:
    """
    Calculate the total price for a dump-trailer hauling job.
    
    Formula:
        total_price = BASE_FEE 
                    + (total_miles × MILE_RATE)
                    + (labor_hours × LABOR_RATE)
                    + (dump_fee + DUMP_PROCESSING_FEE)
                    + Surcharges (Mattresses, Appliances, etc.)
    """
    # Validate inputs
    if labor_hours < 0:
        raise ValueError("labor_hours cannot be negative")
    if dump_fee < 0:
        raise ValueError("dump_fee cannot be negative")
    
    # Calculate mileage
    try:
        calculator = MileageCalculator(api_key=api_key, use_mock=use_mock)
        route_info = calculator.calculate_route_miles(
            start_address=start_address,
            pickup_address=pickup_address,
            dump_address=dump_address,
            return_address=return_address
        )
    except MileageCalculationError as e:
        raise PricingError(f"Failed to calculate mileage: {str(e)}")
    
    total_miles = route_info["total_miles"]
    
    # Calculate cost components
    mileage_cost = total_miles * MILE_RATE
    labor_cost = labor_hours * LABOR_RATE
    dump_cost = dump_fee + DUMP_PROCESSING_FEE
    
    # Calculate surcharges
    surcharges = (
        (num_mattresses * MATTRESS_FEE) +
        (num_appliances * APPLIANCE_FEE) +
        (num_tires * TIRE_FEE)
    )
    
    # Calculate total price
    total_price = BASE_FEE + mileage_cost + labor_cost + dump_cost + surcharges
    
    # Build result
    return JobPriceResult(
        total_miles=total_miles,
        base_fee=BASE_FEE,
        mileage_cost=mileage_cost,
        labor_cost=labor_cost,
        dump_cost=dump_cost,
        surcharges=surcharges,
        total_price=total_price,
        route_details=route_info if include_route_details else None
    )


def calculate_price_with_known_miles(
    total_miles: float,
    labor_hours: float,
    dump_fee: float,
    num_mattresses: int = 0,
    num_appliances: int = 0,
    num_tires: int = 0
) -> JobPriceResult:
    """
    Calculate job price when total miles are already known.
    """
    # Validate inputs
    if total_miles < 0:
        raise ValueError("total_miles cannot be negative")
    if labor_hours < 0:
        raise ValueError("labor_hours cannot be negative")
    if dump_fee < 0:
        raise ValueError("dump_fee cannot be negative")
    
    # Calculate cost components
    mileage_cost = total_miles * MILE_RATE
    labor_cost = labor_hours * LABOR_RATE
    dump_cost = dump_fee + DUMP_PROCESSING_FEE
    
    # Calculate surcharges
    surcharges = (
        (num_mattresses * MATTRESS_FEE) +
        (num_appliances * APPLIANCE_FEE) +
        (num_tires * TIRE_FEE)
    )
    
    # Calculate total price
    total_price = BASE_FEE + mileage_cost + labor_cost + dump_cost + surcharges
    
    return JobPriceResult(
        total_miles=total_miles,
        base_fee=BASE_FEE,
        mileage_cost=mileage_cost,
        labor_cost=labor_cost,
        dump_cost=dump_cost,
        surcharges=surcharges,
        total_price=total_price
    )
