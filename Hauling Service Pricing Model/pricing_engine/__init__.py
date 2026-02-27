"""
Dump-Trailer Towing Service Pricing Engine
==========================================

A modular pricing engine for calculating hauling job costs
based on mileage, labor, dump fees, and base rates.

Operating area: Burbank, CA

Example usage:
    from pricing_engine import calculate_job_price
    
    result = calculate_job_price(
        start_address="Burbank, CA",
        pickup_address="Glendale, CA",
        dump_address="San Fernando Valley Dump, CA",
        return_address="Glendale, CA",
        labor_hours=1.5,
        dump_fee=80,
        use_mock=True  # Set to False and provide API key for production
    )
    
    print(result.to_dict())
"""

from .constants import BASE_FEE, MILE_RATE, LABOR_RATE, DUMP_MARKUP
from .calculator import (
    calculate_job_price,
    calculate_price_with_known_miles,
    JobPriceResult,
    PricingError
)
from .mileage import MileageCalculator, MileageCalculationError

__all__ = [
    # Main functions
    "calculate_job_price",
    "calculate_price_with_known_miles",
    
    # Classes
    "JobPriceResult",
    "MileageCalculator",
    
    # Exceptions
    "PricingError",
    "MileageCalculationError",
    
    # Constants
    "BASE_FEE",
    "MILE_RATE",
    "LABOR_RATE",
    "DUMP_MARKUP",
]

__version__ = "1.0.0"
