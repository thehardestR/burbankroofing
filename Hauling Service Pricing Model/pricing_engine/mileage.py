"""
Mileage calculation module using OpenRouteService API (FREE).
Includes a mock mode for testing without API calls.
"""

import os
from typing import Optional
import requests


class MileageCalculationError(Exception):
    """Raised when mileage calculation fails."""
    pass


class MileageCalculator:
    """
    Calculates driving distances between addresses using OpenRouteService API.
    Free tier: 2,000 requests/day - perfect for small businesses!
    
    Get your free API key at: https://openrouteservice.org/dev/#/signup
    """
    
    # OpenRouteService API endpoints
    ORS_GEOCODE_URL = "https://api.openrouteservice.org/geocode/search"
    ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car"
    
    # Mock distances for testing (in miles)
    MOCK_DISTANCES = {
        ("Burbank, CA", "Glendale, CA"): 6,
        ("Glendale, CA", "Burbank, CA"): 6,
        ("Glendale, CA", "San Fernando Valley Dump, CA"): 18,
        ("San Fernando Valley Dump, CA", "Glendale, CA"): 18,
    }
    
    def __init__(self, api_key: Optional[str] = None, use_mock: bool = False):
        """
        Initialize the mileage calculator.
        
        Args:
            api_key: OpenRouteService API key. If not provided, reads from 
                     ORS_API_KEY environment variable.
            use_mock: If True, use mock distances instead of API calls.
        """
        self.use_mock = use_mock
        self.api_key = api_key or os.environ.get("ORS_API_KEY")
        
        if not self.use_mock and not self.api_key:
            raise ValueError(
                "OpenRouteService API key required. Get a FREE key at "
                "https://openrouteservice.org/dev/#/signup and set ORS_API_KEY "
                "environment variable or pass api_key parameter, "
                "or use use_mock=True for testing."
            )
    
    def _geocode_address(self, address: str) -> tuple:
        """
        Convert an address to latitude/longitude coordinates.
        
        Args:
            address: Street address or location name
            
        Returns:
            Tuple of (longitude, latitude) - note: ORS uses lon,lat order
            
        Raises:
            MileageCalculationError: If address cannot be geocoded
        """
        try:
            headers = {
                "Authorization": self.api_key,
                "Content-Type": "application/json"
            }
            params = {
                "api_key": self.api_key,
                "text": address,
                "size": 1  # Only need the top result
            }
            
            response = requests.get(
                self.ORS_GEOCODE_URL, 
                params=params,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            features = data.get("features", [])
            if not features:
                raise MileageCalculationError(
                    f"Address not found: {address}"
                )
            
            # ORS returns coordinates as [longitude, latitude]
            coords = features[0]["geometry"]["coordinates"]
            return (coords[0], coords[1])  # (lon, lat)
            
        except requests.RequestException as e:
            raise MileageCalculationError(f"Geocoding failed: {str(e)}")
    
    def get_distance(self, origin: str, destination: str) -> float:
        """
        Get driving distance between two addresses in miles.
        
        Args:
            origin: Starting address
            destination: Ending address
            
        Returns:
            Distance in miles
            
        Raises:
            MileageCalculationError: If distance cannot be calculated
        """
        if self.use_mock:
            return self._get_mock_distance(origin, destination)
        return self._get_api_distance(origin, destination)
    
    def _get_mock_distance(self, origin: str, destination: str) -> float:
        """Get distance from mock data for testing."""
        key = (origin, destination)
        if key in self.MOCK_DISTANCES:
            return self.MOCK_DISTANCES[key]
        
        # Try reverse lookup
        reverse_key = (destination, origin)
        if reverse_key in self.MOCK_DISTANCES:
            return self.MOCK_DISTANCES[reverse_key]
        
        raise MileageCalculationError(
            f"Mock distance not found for route: {origin} → {destination}"
        )
    
    def _get_api_distance(self, origin: str, destination: str) -> float:
        """Get distance from OpenRouteService Directions API."""
        try:
            # First, geocode both addresses
            origin_coords = self._geocode_address(origin)
            dest_coords = self._geocode_address(destination)
            
            # Now get the driving distance
            headers = {
                "Authorization": self.api_key,
                "Content-Type": "application/json"
            }
            
            # ORS directions API expects coordinates as [lon, lat]
            body = {
                "coordinates": [
                    list(origin_coords),
                    list(dest_coords)
                ]
            }
            
            response = requests.post(
                self.ORS_DIRECTIONS_URL,
                json=body,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            # Check for errors
            if "error" in data:
                error_msg = data.get("error", {}).get("message", "Unknown error")
                raise MileageCalculationError(f"Routing error: {error_msg}")
            
            # Extract distance from response (in meters)
            routes = data.get("routes", [])
            if not routes:
                raise MileageCalculationError(
                    f"No route found between {origin} and {destination}"
                )
            
            distance_meters = routes[0]["summary"]["distance"]
            distance_miles = distance_meters / 1609.344
            
            return round(distance_miles, 1)
            
        except requests.RequestException as e:
            raise MileageCalculationError(f"API request failed: {str(e)}")
    
    def calculate_route_miles(
        self,
        start_address: str,
        pickup_address: str,
        dump_address: str,
        return_address: str
    ) -> dict:
        """
        Calculate total miles for a complete hauling job route.
        
        Route: start → pickup → dump → return → start
        
        Args:
            start_address: Where the driver/truck starts
            pickup_address: Customer pickup location
            dump_address: Dump site location
            return_address: Where to return after dumping
            
        Returns:
            Dictionary with individual leg distances and total miles
            
        Raises:
            MileageCalculationError: If any distance calculation fails
        """
        # Calculate each leg of the journey
        leg_1 = self.get_distance(start_address, pickup_address)
        leg_2 = self.get_distance(pickup_address, dump_address)
        leg_3 = self.get_distance(dump_address, return_address)
        leg_4 = self.get_distance(return_address, start_address)
        
        total_miles = leg_1 + leg_2 + leg_3 + leg_4
        
        return {
            "start_to_pickup": leg_1,
            "pickup_to_dump": leg_2,
            "dump_to_return": leg_3,
            "return_to_start": leg_4,
            "total_miles": total_miles
        }
