"""
Dump-Trailer Hauling Service - Instant Quote Calculator
Simple, clean interface for customers to get instant quotes.
"""

import streamlit as st
import os
from pricing_engine import (
    calculate_price_with_known_miles,
    BASE_FEE,
    MILE_RATE,
    LABOR_RATE,
    DUMP_MARKUP
)
from pricing_engine.mileage import MileageCalculator, MileageCalculationError

# =============================================================================
# CONFIGURATION
# =============================================================================

TRUCK_BASE = "1418 N Niagara St, Burbank, CA 91505"

DUMP_SITES = [
    "Scholl Canyon Landfill, 3100 N Figueroa St, Glendale, CA 91206",
    "Sun Valley Landfill, 11155 Pendleton St, Sun Valley, CA 91352",
    "Burbank Recycle Center, 500 S Flower St, Burbank, CA 91502",
]

SERVICE_TYPES = {
    "trailer_rental": {
        "name": "🚛 Dump Trailer Rental",
        "description": "We drop off a trailer, you load it, we pick it up and haul it away",
        "labor_hours": 1.0,
        "dump_fee": 75
    },
    "full_service": {
        "name": "💪 Full Service Haul", 
        "description": "We come, load everything, and haul it to the dump",
        "labor_hours": 2.0,
        "dump_fee": 75
    },
    "pickup_only": {
        "name": "🚚 Pick Up Only",
        "description": "We pick up your loaded trailer, haul it to the dump, and return it — you pay dump fees directly",
        "labor_hours": 0.0,
        "dump_fee": 0
    }
}

# =============================================================================
# API SETUP
# =============================================================================

def get_api_key():
    try:
        return st.secrets["ORS_API_KEY"]
    except (KeyError, FileNotFoundError):
        return os.environ.get("ORS_API_KEY")

ORS_API_KEY = get_api_key()

# =============================================================================
# PAGE CONFIG
# =============================================================================

st.set_page_config(
    page_title="Get a Hauling Quote",
    page_icon="🚛",
    layout="centered"
)

st.markdown("""
<style>
    .main-title { text-align: center; font-size: 2.5rem; font-weight: bold; margin-bottom: 0; }
    .subtitle { text-align: center; color: #666; font-size: 1.1rem; margin-bottom: 2rem; }
    .price-box {
        background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%);
        color: white; padding: 2rem; border-radius: 15px; text-align: center; margin: 1.5rem 0;
    }
    .price-amount { font-size: 3.5rem; font-weight: bold; margin: 0.5rem 0; }
    .stButton > button {
        width: 100%; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%);
        color: white; border: none; padding: 1rem 2rem; font-size: 1.2rem;
        font-weight: bold; border-radius: 10px; margin-top: 1rem;
    }
</style>
""", unsafe_allow_html=True)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def find_nearest_dump(job_address: str, calculator: MileageCalculator) -> tuple:
    nearest_dump = None
    shortest_distance = float('inf')
    for dump_site in DUMP_SITES:
        try:
            distance = calculator.get_distance(job_address, dump_site)
            if distance < shortest_distance:
                shortest_distance = distance
                nearest_dump = dump_site
        except MileageCalculationError:
            continue
    if nearest_dump is None:
        raise MileageCalculationError("Could not find route to any dump site")
    return nearest_dump, shortest_distance

def calculate_full_route(job_address: str, calculator: MileageCalculator) -> dict:
    nearest_dump, job_to_dump = find_nearest_dump(job_address, calculator)
    base_to_job = calculator.get_distance(TRUCK_BASE, job_address)
    total_miles = base_to_job + job_to_dump + job_to_dump + base_to_job
    return {
        "nearest_dump": nearest_dump.split(",")[0],
        "base_to_job": base_to_job,
        "job_to_dump": job_to_dump,
        "total_miles": round(total_miles, 1)
    }

# =============================================================================
# MAIN APP
# =============================================================================

st.markdown('<p class="main-title">🚛 Dump Trailer Hauling</p>', unsafe_allow_html=True)
st.markdown('<p class="subtitle">Serving Burbank & Los Angeles Area</p>', unsafe_allow_html=True)

# Input method toggle
input_method = st.radio(
    "How would you like to estimate distance?",
    options=["address", "miles"],
    format_func=lambda x: "📍 Enter an address" if x == "address" else "🔢 Enter miles directly",
    horizontal=True
)

job_address = None
manual_miles = None

if input_method == "address":
    job_address = st.text_input(
        "📍 Enter your job site address",
        placeholder="e.g., 123 Main St, Glendale, CA"
    )
else:
    manual_miles = st.number_input(
        "🔢 Total round-trip miles",
        min_value=1.0,
        max_value=500.0,
        value=25.0,
        step=1.0,
        help="Estimate the total miles for the job (base → job site → dump → back)"
    )

service_type = st.radio(
    "What do you need?",
    options=list(SERVICE_TYPES.keys()),
    format_func=lambda x: SERVICE_TYPES[x]["name"],
    horizontal=True
)
st.caption(SERVICE_TYPES[service_type]["description"])

# Extra Items (Revenue Generators)
with st.expander("🗑️ Do you have any of these specific items?"):
    st.info("These items have special handling fees but are often cheaper than full-service removal!")
    col1, col2, col3 = st.columns(3)
    with col1:
        num_mattresses = st.number_input("Mattresses ($45)", 0, 10, 0)
    with col2:
        num_appliances = st.number_input("Appliances ($40)", 0, 10, 0)
    with col3:
        num_tires = st.number_input("Tires ($20)", 0, 10, 0)

# Get Quote
if st.button("Get My Quote"):
    if input_method == "address" and not job_address:
        st.error("Please enter your address")
    elif input_method == "address" and not ORS_API_KEY:
        st.error("Service unavailable. Please call us!")
    else:
        try:
            service = SERVICE_TYPES[service_type]

            if input_method == "address":
                with st.spinner("Calculating..."):
                    calculator = MileageCalculator(api_key=ORS_API_KEY, use_mock=False)
                    route = calculate_full_route(job_address, calculator)
                    total_miles = route["total_miles"]
                    dump_label = route["nearest_dump"]
            else:
                total_miles = round(manual_miles, 1)
                dump_label = None

            result = calculate_price_with_known_miles(
                total_miles=total_miles,
                labor_hours=service["labor_hours"],
                dump_fee=service["dump_fee"],
                num_mattresses=num_mattresses,
                num_appliances=num_appliances,
                num_tires=num_tires
            )

            subtitle = f"{total_miles} miles"
            if dump_label:
                subtitle += f" • Nearest dump: {dump_label}"

            st.markdown(f"""
            <div class="price-box">
                <p style="margin: 0; font-size: 1.1rem;">Your Quote</p>
                <p class="price-amount">${result.total_price:,.0f}</p>
                <p style="margin: 0; opacity: 0.9;">{subtitle}</p>
            </div>
            """, unsafe_allow_html=True)
            
            with st.expander("See breakdown"):
                st.write(f"**Base fee:** ${result.base_fee:.0f}")
                st.write(f"**Mileage:** {total_miles} mi × ${MILE_RATE} = ${result.mileage_cost:.0f}")
                st.write(f"**Labor:** {service['labor_hours']} hrs × ${LABOR_RATE} = ${result.labor_cost:.0f}")
                
                # Dynamic dump fee label
                dump_text = f"**Dump & Gate fees:** ${result.dump_cost:.0f}"
                if service_type == "pickup_only":
                    dump_text += " (Includes gate processing fee only)"
                st.write(dump_text)
                
                if result.surcharges > 0:
                    st.write(f"**Special Items:** ${result.surcharges:.0f}")
            
            st.success("Ready to book? Call or text us!")
            col1, col2 = st.columns(2)
            with col1:
                st.link_button("📞 Call", "tel:+18185551234", use_container_width=True)
            with col2:
                st.link_button("💬 Text", "sms:+18185551234", use_container_width=True)
                
        except MileageCalculationError:
            st.error("Couldn't find that address. Please try again.")
        except Exception:
            st.error("Something went wrong. Please call us!")

st.markdown("---")
st.caption("Licensed & Insured • Same Day Service Available")
