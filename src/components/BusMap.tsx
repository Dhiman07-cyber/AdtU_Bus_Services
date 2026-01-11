"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import { useBusLocation } from '@/hooks/useBusLocation';
import { useWaitingFlags } from '@/hooks/useWaitingFlags';
import { getRouteById } from '@/lib/dataService';
import { fetchRouteGeometryViaProxy } from '@/lib/ors-service';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Default center (you can change this to your default location)
const center: [number, number] = [
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT || "0"),
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG || "0")
];

interface BusLocation {
  busId: string;
  driverUid: string;
  speed: number;
  heading: number;
  timestamp: string;
}

interface WaitingFlag {
  id: string;
  studentUid: string;
  studentName: string;
  busId: string;
  routeId: string;
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLng: number;
  status: 'raised' | 'acknowledged' | 'boarded' | 'expired';
  createdAt: string;
  expiresAt: string;
  ackByDriverUid?: string;
}

interface RouteStop {
  name: string;
  time?: string;
}

export default function BusMap({ 
  routeId,
  role,
  journeyActive = false
}: { 
  routeId: string; 
  role: string;
  journeyActive?: boolean;
}) {
  const { currentLocation: busLocation, history, loading: busLoading, error: busError, getInterpolatedPosition } = useBusLocation(routeId);
  const { flags: waitingFlags, loading: flagsLoading, error: flagsError } = useWaitingFlags(routeId);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);

  // Fetch route data and geometry
  useEffect(() => {
    const fetchRouteData = async () => {
      if (!routeId) return;
      
      try {
        // Fetch route details
        const route = await getRouteById(routeId);
        if (route && route.stops) {
          setRouteStops(route.stops);
          
          // Set map center to first stop if available
          if (route.stops.length > 0) {
            setMapCenter([0, 0]); // Default center
          }
          
          // Fetch route geometry if we have enough stops
          if (route.stops.length >= 2) {
            // Use default coordinates for route geometry
            const coordinates = route.stops.map((stop: any, index: number) => ({
              lat: 0 + (index * 0.001),
              lng: 0 + (index * 0.001)
            }));
            
            try {
              const geometry = await fetchRouteGeometryViaProxy(coordinates);
              if (geometry) {
                // Convert [lng, lat] to [lat, lng] format for Leaflet
                const leafletCoords = geometry.coordinates.map(coord => [coord[1], coord[0]] as [number, number]);
                setRoutePolyline(leafletCoords);
              } else {
                // If ORS fails, fall back to simple polyline connecting stops
                console.warn('Using simple polyline fallback');
                const simplePolyline = route.stops.map((stop: any, index: number) => [0 + (index * 0.001), 0 + (index * 0.001)] as [number, number]);
                setRoutePolyline(simplePolyline);
              }
            } catch (orsError) {
              console.warn('ORS error, using simple polyline:', orsError);
              // Fallback: create simple polyline by connecting stops directly
              const simplePolyline = route.stops.map((stop: any, index: number) => [0 + (index * 0.001), 0 + (index * 0.001)] as [number, number]);
              setRoutePolyline(simplePolyline);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching route data:', err);
      }
    };

    fetchRouteData();
  }, [routeId]);

  // Update loading state
  useEffect(() => {
    if (!busLoading && !flagsLoading) {
      setLoading(false);
    }
  }, [busLoading, flagsLoading]);

  // Update error state
  useEffect(() => {
    if (busError || flagsError) {
      setError(busError || flagsError);
    }
  }, [busError, flagsError]);

  // Map options to enable all interactions
  const mapOptions = {
    zoomControl: true,
    doubleClickZoom: true,
    dragging: true,
    scrollWheelZoom: true,
    touchZoom: true,
    keyboard: true,
    attributionControl: true,
  };

  return (
    <div className="relative">
      <MapContainer 
        center={mapCenter} 
        zoom={13} 
        style={{ height: '400px', width: '100%' }}
        className="rounded-lg"
        zoomControl={true}
        doubleClickZoom={true}
        dragging={true}
        scrollWheelZoom={true}
        touchZoom={true}
        keyboard={true}
        attributionControl={true}
      >
        <TileLayer
          url={process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          attribution={process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        />
        
        {/* Route polyline */}
        {routePolyline.length > 0 && (
          <Polyline
            positions={routePolyline}
            color="#3b82f6"
            weight={4}
            opacity={0.7}
          />
        )}
        
        {/* Route stops */}
        {routeStops.map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            position={[0 + (index * 0.001), 0 + (index * 0.001)]}
          >
            <Popup>
              <div className="font-bold">{stop.name}</div>
              {stop.time && <div>Scheduled: {stop.time}</div>}
            </Popup>
          </Marker>
        ))}
        
        {/* Bus marker - Only show when journey is active */}
        {journeyActive && busLocation && (
          <Marker
            position={[0, 0]}
          >
            <Popup>
              <div className="font-bold">Bus: {busLocation.busId}</div>
              <div>Speed: {busLocation.speed?.toFixed(1) || 0} km/h</div>
              <div>Updated: {new Date(busLocation.timestamp).toLocaleTimeString()}</div>
            </Popup>
          </Marker>
        )}

        {/* Student markers - Only show when journey is active */}
        {journeyActive && waitingFlags.map((flag: WaitingFlag) => (
          <Marker
            key={flag.id}
            position={[0, 0]}
          >
            <Popup>
              <div className="font-bold">{flag.studentName}</div>
              <div>Stop: {flag.stopName}</div>
              <div>Status: {flag.status}</div>
              <div>Created: {new Date(flag.createdAt).toLocaleTimeString()}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {routeId && !journeyActive && (
        <div className="absolute top-2 left-2 right-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg shadow-sm z-10">
          <div className="flex items-center">
            <div className="h-5 w-5 mr-2">🚌</div>
            <div>
              <p className="font-medium">Journey Not Active</p>
              <p className="text-sm">
                {role === 'driver' 
                  ? 'Start your journey to show bus location and student waiting flags on the map.'
                  : 'Driver has not started the journey yet. Waiting flags will appear when the journey begins.'
                }
              </p>
            </div>
          </div>
        </div>
      )}
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-2 left-2 right-2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 bg-white bg-opacity-90 px-3 py-2 rounded text-sm">
        <div>Bus Location: {busLocation ? 'Active' : 'Inactive'}</div>
        <div>Student Flags: {waitingFlags.length}</div>
        <div>Route Stops: {routeStops.length}</div>
      </div>
    </div>
  );
}