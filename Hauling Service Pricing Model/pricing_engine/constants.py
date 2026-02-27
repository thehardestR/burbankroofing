"""
Pricing constants for the dump-trailer towing service.
These values can be adjusted as needed for the Burbank, CA operation.
"""

# Base fee charged for every job
BASE_FEE = 150

# Rate per mile traveled (dollars)
MILE_RATE = 3.0

# Rate per hour of labor (dollars)
LABOR_RATE = 60

# Flat fee for processing/waiting at the dump (Gate Fee)
# This covers the driver's time waiting in line at the scale.
DUMP_PROCESSING_FEE = 25

# =============================================================================
# SURCHARGES (High Margin Revenue)
# =============================================================================

# Surcharge per mattress (often free to recycle, so this is high margin)
MATTRESS_FEE = 45

# Surcharge per appliance (refrigerators, washers, etc.)
APPLIANCE_FEE = 40

# Surcharge per tire
TIRE_FEE = 20
