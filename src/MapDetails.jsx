import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { io } from 'socket.io-client';

// Mapbox access token
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2FuamFuYXludnNkbCIsImEiOiJjbWFnZ2h4YTMwMHVyMmtzN2xoZXg1NmNwIn0.Monymzp3uoEXufc95ywKcA';
mapboxgl.accessToken = MAPBOX_TOKEN;

// Destination coordinates (16°14′N 77°48′E)
const DESTINATION = [77.6525189, 12.9742939];

export default function MapDetails({ orderHash = 'orderId9:riderId2', isTracking = false, onRiderInfoUpdate }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const socketRef = useRef(null);
  const locationTimeoutRef = useRef(null);
  
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [riderLocation, setRiderLocation] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routeInfo, setRouteInfo] = useState({ distance: 0, duration: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize map when component mounts
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    try {
      console.log('Initializing map...');
      
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v11',
        center: DESTINATION,
        zoom: 12
      });
      
      // Add navigation controls
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // Create destination marker
      const destinationMarker = new mapboxgl.Marker({ color: '#2196F3' })
        .setLngLat(DESTINATION)
        .addTo(map);
      
      destinationMarkerRef.current = destinationMarker;
      
      // Create rider marker (will be positioned later)
      const riderMarker = new mapboxgl.Marker({ color: '#F44336' });
      riderMarkerRef.current = riderMarker;
      
      // Save map reference
      mapRef.current = map;
      
      // Add a load event to confirm the map is fully loaded
      map.on('load', () => {
        console.log('Map fully loaded');
        setIsMapInitialized(true);
        setIsLoading(false);
      });
      
      // Add an error event handler
      map.on('error', (e) => {
        console.error('Map error:', e);
        setError(`Map error: ${e.error?.message || 'Unknown error'}`);
      });
      
      return () => {
        console.log('Cleaning up map...');
        map.remove();
        if (locationTimeoutRef.current) {
          clearTimeout(locationTimeoutRef.current);
        }
      };
    } catch (err) {
      console.error('Error creating map:', err);
      setError(`Error creating map: ${err.message}`);
      setIsLoading(false);
    }
  }, []);
  
  // Connect to socket when tracking starts
  useEffect(() => {
    if (!isTracking || !isMapInitialized) return;
    
    console.log('Connecting to socket for tracking...');
    setIsLoading(true);
    
    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setError('Authentication required. Please login first.');
        setIsLoading(false);
        return;
      }

      const socket = io('https://zuvees-delivery-backend.onrender.com', {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        auth: {
          token: token
        }
      });
      
      socket.on('connect', () => {
        console.log('Connected to socket server');
        // Join tracking room
        socket.emit('joinTrackingRoom', orderHash);
        console.log(`Joined tracking room: ${orderHash}`);
        setIsLoading(false);
      });
      
      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setError(`Connection error: ${error.message}`);
        setIsLoading(false);
      });
      
      socket.on('riderLocation', (data) => {
        console.log('Received location update:', data);
        
        // Reset timeout for fallback API call
        if (locationTimeoutRef.current) {
          clearTimeout(locationTimeoutRef.current);
        }
        
        // Set new timeout for fallback
        locationTimeoutRef.current = setTimeout(() => {
          fetchLastKnownLocation();
        }, 15000);
        
        // Extract location data based on the format shown in your error message
        // Format: {hash: "orderId9:riderId2", location: {lat: 16.2330121, lng: 77.8128976}, timestamp: "..."}
        let locationData = null;
        
        try {
          if (data && data.location && typeof data.location === 'object') {
            // The format you're receiving
            const loc = data.location;
            if (loc.lat !== undefined && loc.lng !== undefined) {
              locationData = {
                latitude: Number(loc.lat),
                longitude: Number(loc.lng),
                timestamp: data.timestamp || new Date().toISOString()
              };
            } else if (loc.latitude !== undefined && loc.longitude !== undefined) {
              locationData = {
                latitude: Number(loc.latitude),
                longitude: Number(loc.longitude),
                timestamp: data.timestamp || new Date().toISOString()
              };
            }
          } else if (data && (data.lat !== undefined || data.latitude !== undefined)) {
            // Direct coordinates in the data object
            locationData = {
              latitude: Number(data.latitude || data.lat),
              longitude: Number(data.longitude || data.lng),
              timestamp: data.timestamp || new Date().toISOString()
            };
          }
          
          if (locationData && !isNaN(locationData.latitude) && !isNaN(locationData.longitude)) {
            console.log('Processed location data:', locationData);
            updateRiderLocation(locationData);
          } else {
            console.error('Invalid location format received:', data);
          }
        } catch (err) {
          console.error('Error processing location data:', err, data);
        }
      });
      
      socketRef.current = socket;
      
      return () => {
        console.log('Disconnecting socket...');
        socket.disconnect();
        if (locationTimeoutRef.current) {
          clearTimeout(locationTimeoutRef.current);
        }
      };
    } catch (err) {
      console.error('Error connecting to socket:', err);
      setError(`Socket error: ${err.message}`);
      setIsLoading(false);
    }
  }, [isTracking, isMapInitialized, orderHash]);
  
  // Update rider location and fetch route
  const updateRiderLocation = (location) => {
    // Safety check for valid coordinates
    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      console.error('Invalid location data:', location);
      return;
    }
    
    setRiderLocation(location);
    
    // Notify parent component with location only (no route info yet)
    if (onRiderInfoUpdate) {
      onRiderInfoUpdate({
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: location.timestamp,
        routeInfo: routeInfo // Use current route info
      });
    }
    
    if (mapRef.current && riderMarkerRef.current) {
      const riderCoords = [location.longitude, location.latitude];
      
      // Update rider marker
      riderMarkerRef.current
        .setLngLat(riderCoords)
        .addTo(mapRef.current);
      
      // Fit map to show both rider and destination
      const bounds = new mapboxgl.LngLatBounds()
        .extend(riderCoords)
        .extend(DESTINATION);
      
      mapRef.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 15,
        duration: 1000
      });
      
      // Fetch route
      fetchRoute(location);
    }
  };
  
  // Fetch last known location from API
  const fetchLastKnownLocation = async () => {
    try {
      console.log('Fetching last known location from API');
      const response = await fetch('https://zuvees-delivery-backend.onrender.com/rider-location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
        },
        body: JSON.stringify({ hash: orderHash })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Retrieved last known location:', data);
        
        // Extract location data similar to socket handler
        let locationData = null;
        
        try {
          if (data && data.location && typeof data.location === 'object') {
            const loc = data.location;
            if (loc.lat !== undefined && loc.lng !== undefined) {
              locationData = {
                latitude: Number(loc.lat),
                longitude: Number(loc.lng),
                timestamp: data.timestamp || new Date().toISOString()
              };
            } else if (loc.latitude !== undefined && loc.longitude !== undefined) {
              locationData = {
                latitude: Number(loc.latitude),
                longitude: Number(loc.longitude),
                timestamp: data.timestamp || new Date().toISOString()
              };
            }
          } else if (data && (data.lat !== undefined || data.latitude !== undefined)) {
            locationData = {
              latitude: Number(data.latitude || data.lat),
              longitude: Number(data.longitude || data.lng),
              timestamp: data.timestamp || new Date().toISOString()
            };
          }
          
          if (locationData && !isNaN(locationData.latitude) && !isNaN(locationData.longitude)) {
            console.log('Processed location data from API:', locationData);
            updateRiderLocation(locationData);
          } else {
            console.error('Invalid location format received from API:', data);
          }
        } catch (err) {
          console.error('Error processing location data from API:', err, data);
        }
      } else {
        console.log('No location data found or error fetching location');
      }
    } catch (error) {
      console.error('Error fetching last known location:', error);
    }
  };
  
  // Fetch route between rider location and destination
  const fetchRoute = async (start) => {
    // Safety check for valid coordinates
    if (!start || typeof start.latitude !== 'number' || typeof start.longitude !== 'number') {
      console.error('Invalid start location for route:', start);
      return;
    }
    
    try {
      const startCoords = [start.longitude, start.latitude];
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${DESTINATION[0]},${DESTINATION[1]}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
      
      console.log('Fetching route with URL:', url);
      const res = await fetch(url);
      const json = await res.json();
      
      if (json.routes && json.routes[0]) {
        const route = json.routes[0];
        const routeGeoJSON = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: route.geometry.coordinates
          }
        };
        
        const newRouteInfo = {
          distance: (route.distance / 1000).toFixed(2), // km
          duration: Math.round(route.duration / 60) // minutes
        };
        
        setRouteData(routeGeoJSON);
        setRouteInfo(newRouteInfo);
        
        // Only update parent with the complete info now that we have route data
        if (onRiderInfoUpdate && riderLocation) {
          onRiderInfoUpdate({
            latitude: riderLocation.latitude,
            longitude: riderLocation.longitude,
            timestamp: riderLocation.timestamp,
            routeInfo: newRouteInfo
          });
        }
        
        // Add or update route on map
        if (mapRef.current) {
          const map = mapRef.current;
          
          // Remove existing route if it exists
          if (map.getSource('route')) {
            map.removeLayer('route-line');
            map.removeSource('route');
          }
          
          // Add new route
          map.addSource('route', {
            type: 'geojson',
            data: routeGeoJSON
          });
          
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#3887be',
              'line-width': 5,
              'line-opacity': 0.75
            }
          });
        }
      }
    } catch (err) {
      console.error('Error fetching route details:', err);
    }
  };
  
  // Fall back to API if no socket updates after component mount
  useEffect(() => {
    if (isTracking && isMapInitialized && !riderLocation) {
      const timeout = setTimeout(() => {
        fetchLastKnownLocation();
      }, 2000); // Try after 2 seconds if no immediate socket data
      
      return () => clearTimeout(timeout);
    }
  }, [isTracking, isMapInitialized, riderLocation]);
  
  return (
    <div className="relative w-full h-full">
      {/* Map container - explicitly set height */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full" 
        style={{ height: '100%', minHeight: '300px' }}
      />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-[#745a5a] rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-gray-700">Loading map...</p>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-100 border border-red-400 text-red-700 p-2 rounded z-20">
          {error}
        </div>
      )}
      
      {/* Info overlay when tracking but no location yet */}
      {isTracking && isMapInitialized && !riderLocation && !isLoading && !error && (
        <div className="absolute bottom-4 left-4 right-4 bg-white bg-opacity-90 p-2 rounded shadow z-20">
          <p className="text-sm text-gray-700">Waiting for rider location updates...</p>
        </div>
      )}
      
      {/* Route info overlay */}
      {isTracking && riderLocation && routeInfo && (
        <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 p-3 rounded shadow z-20 max-w-[200px]">
          <div className="text-xs font-semibold mb-1">Distance to destination</div>
          <div className="text-sm">{routeInfo.distance} km</div>
          <div className="text-xs font-semibold mt-2 mb-1">Estimated time</div>
          <div className="text-sm">{routeInfo.duration} minutes</div>
        </div>
      )}
    </div>
  );
}