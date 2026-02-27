"""
Unit tests for the pricing engine.
Validates the example scenario from requirements.
"""

import unittest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pricing_engine import (
    calculate_job_price,
    calculate_price_with_known_miles,
    BASE_FEE,
    MILE_RATE,
    LABOR_RATE,
    DUMP_MARKUP
)


class TestPricingConstants(unittest.TestCase):
    """Test that constants are set correctly."""
    
    def test_base_fee(self):
        self.assertEqual(BASE_FEE, 150)
    
    def test_mile_rate(self):
        self.assertEqual(MILE_RATE, 3.0)
    
    def test_labor_rate(self):
        self.assertEqual(LABOR_RATE, 60)
    
    def test_dump_markup(self):
        self.assertEqual(DUMP_MARKUP, 25)


class TestExampleScenario(unittest.TestCase):
    """
    Test the exact example scenario from requirements.
    
    Route distances:
    - Burbank → Glendale = 6 miles
    - Glendale → San Fernando Valley dump = 18 miles
    - Dump → Glendale = 18 miles
    - Glendale → Burbank = 6 miles
    Total miles = 48
    
    Inputs:
    - labor_hours = 1.5
    - dump_fee = 80
    
    Expected outputs:
    - Mileage cost = 48 × 3 = 144
    - Labor cost = 1.5 × 60 = 90
    - Dump cost = 80 + 25 = 105
    - Total price = 150 + 144 + 90 + 105 = 489
    """
    
    def test_example_scenario_with_mock_api(self):
        """Test using mock mileage API."""
        result = calculate_job_price(
            start_address="Burbank, CA",
            pickup_address="Glendale, CA",
            dump_address="San Fernando Valley Dump, CA",
            return_address="Glendale, CA",
            labor_hours=1.5,
            dump_fee=80,
            use_mock=True
        )
        
        # Verify all components
        self.assertEqual(result.total_miles, 48)
        self.assertEqual(result.base_fee, 150)
        self.assertEqual(result.mileage_cost, 144)
        self.assertEqual(result.labor_cost, 90)
        self.assertEqual(result.dump_cost, 105)
        self.assertEqual(result.total_price, 489)
    
    def test_example_scenario_with_known_miles(self):
        """Test using pre-calculated miles."""
        result = calculate_price_with_known_miles(
            total_miles=48,
            labor_hours=1.5,
            dump_fee=80
        )
        
        # Verify all components
        self.assertEqual(result.total_miles, 48)
        self.assertEqual(result.base_fee, 150)
        self.assertEqual(result.mileage_cost, 144)
        self.assertEqual(result.labor_cost, 90)
        self.assertEqual(result.dump_cost, 105)
        self.assertEqual(result.total_price, 489)
    
    def test_to_dict_format(self):
        """Test that output dictionary has correct structure."""
        result = calculate_price_with_known_miles(
            total_miles=48,
            labor_hours=1.5,
            dump_fee=80
        )
        
        result_dict = result.to_dict()
        
        # Verify all required keys exist
        required_keys = [
            "total_miles",
            "base_fee",
            "mileage_cost",
            "labor_cost",
            "dump_cost",
            "total_price"
        ]
        for key in required_keys:
            self.assertIn(key, result_dict)
        
        # Verify values
        self.assertEqual(result_dict["total_miles"], 48)
        self.assertEqual(result_dict["base_fee"], 150)
        self.assertEqual(result_dict["mileage_cost"], 144)
        self.assertEqual(result_dict["labor_cost"], 90)
        self.assertEqual(result_dict["dump_cost"], 105)
        self.assertEqual(result_dict["total_price"], 489)


class TestInputValidation(unittest.TestCase):
    """Test input validation."""
    
    def test_negative_labor_hours(self):
        """Negative labor hours should raise ValueError."""
        with self.assertRaises(ValueError):
            calculate_price_with_known_miles(
                total_miles=48,
                labor_hours=-1,
                dump_fee=80
            )
    
    def test_negative_dump_fee(self):
        """Negative dump fee should raise ValueError."""
        with self.assertRaises(ValueError):
            calculate_price_with_known_miles(
                total_miles=48,
                labor_hours=1.5,
                dump_fee=-10
            )
    
    def test_negative_miles(self):
        """Negative miles should raise ValueError."""
        with self.assertRaises(ValueError):
            calculate_price_with_known_miles(
                total_miles=-5,
                labor_hours=1.5,
                dump_fee=80
            )
    
    def test_zero_values_allowed(self):
        """Zero values should be allowed."""
        result = calculate_price_with_known_miles(
            total_miles=0,
            labor_hours=0,
            dump_fee=0
        )
        
        # Only base fee and dump markup
        self.assertEqual(result.total_price, BASE_FEE + DUMP_MARKUP)


class TestRouteDetails(unittest.TestCase):
    """Test route details functionality."""
    
    def test_include_route_details(self):
        """Test that route details are included when requested."""
        result = calculate_job_price(
            start_address="Burbank, CA",
            pickup_address="Glendale, CA",
            dump_address="San Fernando Valley Dump, CA",
            return_address="Glendale, CA",
            labor_hours=1.5,
            dump_fee=80,
            use_mock=True,
            include_route_details=True
        )
        
        result_dict = result.to_dict()
        self.assertIn("route_details", result_dict)
        
        route = result_dict["route_details"]
        self.assertEqual(route["start_to_pickup"], 6)
        self.assertEqual(route["pickup_to_dump"], 18)
        self.assertEqual(route["dump_to_return"], 18)
        self.assertEqual(route["return_to_start"], 6)
        self.assertEqual(route["total_miles"], 48)


if __name__ == "__main__":
    unittest.main(verbosity=2)
