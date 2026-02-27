"""
Example usage of the dump-trailer towing service pricing engine.
Demonstrates the required example scenario and additional use cases.
"""

from pricing_engine import (
    calculate_job_price,
    calculate_price_with_known_miles
)


def main():
    print("=" * 60)
    print("DUMP-TRAILER TOWING SERVICE - PRICING ENGINE")
    print("Operating Area: Burbank, CA")
    print("=" * 60)
    
    # ===================================================================
    # EXAMPLE SCENARIO (from requirements)
    # ===================================================================
    print("\n📋 EXAMPLE SCENARIO (Validating Required Output)")
    print("-" * 60)
    
    # Using mock API for testing
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
    
    print("\nInput Parameters:")
    print(f"  • Start Address:   Burbank, CA")
    print(f"  • Pickup Address:  Glendale, CA")
    print(f"  • Dump Address:    San Fernando Valley Dump, CA")
    print(f"  • Return Address:  Glendale, CA")
    print(f"  • Labor Hours:     1.5")
    print(f"  • Dump Fee:        $80")
    
    print("\nRoute Breakdown:")
    route = result.route_details
    print(f"  • Burbank → Glendale:          {route['start_to_pickup']} miles")
    print(f"  • Glendale → Dump:             {route['pickup_to_dump']} miles")
    print(f"  • Dump → Glendale:             {route['dump_to_return']} miles")
    print(f"  • Glendale → Burbank:          {route['return_to_start']} miles")
    print(f"  • TOTAL MILES:                 {route['total_miles']} miles")
    
    print("\nCost Breakdown:")
    print(f"  • Base Fee:                    ${result.base_fee:.2f}")
    print(f"  • Mileage Cost (48 × $3):      ${result.mileage_cost:.2f}")
    print(f"  • Labor Cost (1.5 × $60):      ${result.labor_cost:.2f}")
    print(f"  • Dump Cost ($80 + $25):       ${result.dump_cost:.2f}")
    print(f"  ─────────────────────────────────────")
    print(f"  • TOTAL PRICE:                 ${result.total_price:.2f}")
    
    # Verify expected values
    print("\n✅ Validation:")
    expected = {
        "total_miles": 48,
        "mileage_cost": 144,
        "labor_cost": 90,
        "dump_cost": 105,
        "total_price": 489
    }
    
    all_passed = True
    for key, expected_value in expected.items():
        actual_value = getattr(result, key)
        status = "✓" if actual_value == expected_value else "✗"
        if actual_value != expected_value:
            all_passed = False
        print(f"  {status} {key}: {actual_value} (expected: {expected_value})")
    
    if all_passed:
        print("\n🎉 All validations PASSED!")
    
    # ===================================================================
    # OUTPUT AS DICTIONARY (JSON-ready)
    # ===================================================================
    print("\n\n📤 OUTPUT AS DICTIONARY (JSON-ready)")
    print("-" * 60)
    
    output_dict = result.to_dict()
    import json
    print(json.dumps(output_dict, indent=2))
    
    # ===================================================================
    # QUICK ESTIMATE (Known Miles)
    # ===================================================================
    print("\n\n⚡ QUICK ESTIMATE (Pre-calculated Miles)")
    print("-" * 60)
    
    quick_result = calculate_price_with_known_miles(
        total_miles=30,
        labor_hours=2.0,
        dump_fee=100
    )
    
    print(f"  Total Miles:    30")
    print(f"  Labor Hours:    2.0")
    print(f"  Dump Fee:       $100")
    print(f"  ─────────────────────")
    print(f"  Total Price:    ${quick_result.total_price:.2f}")
    
    # ===================================================================
    # API MODE (Production)
    # ===================================================================
    print("\n\n🌐 PRODUCTION MODE (Google Maps API)")
    print("-" * 60)
    print("  To use real distances, call with:")
    print("  ")
    print("  result = calculate_job_price(")
    print("      start_address='123 Main St, Burbank, CA',")
    print("      pickup_address='456 Oak Ave, Glendale, CA',")
    print("      dump_address='Sun Valley Landfill, Sun Valley, CA',")
    print("      return_address='456 Oak Ave, Glendale, CA',")
    print("      labor_hours=2.0,")
    print("      dump_fee=95,")
    print("      api_key='YOUR_GOOGLE_MAPS_API_KEY'")
    print("  )")
    print("  ")
    print("  Or set environment variable: GOOGLE_MAPS_API_KEY")
    
    print("\n" + "=" * 60)
    print("END OF DEMO")
    print("=" * 60)


if __name__ == "__main__":
    main()
