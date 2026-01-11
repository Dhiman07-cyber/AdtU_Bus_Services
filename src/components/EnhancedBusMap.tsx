"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from 'next/dynamic';
import { useBusLocation } from '@/hooks/useBusLocation';
import { useWaitingFlags } from '@/hooks/useWaitingFlags';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { AlertCircle } from 'lucide-react';

// Dynamic imports to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.MapContainer };
}), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.TileLayer };
}), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.Marker };
}), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.Popup };
}), { ssr: false });
// Removed polyline rendering for live-location-only mode
// Removed useMap dynamic import; MapController is not needed in live-only mode

// Leaflet and icon initialization
let L: any = null;
let busIcon: any = null;
let flagIcon: any = null;

const initializeLeafletIcons = async () => {
  if (typeof window !== 'undefined' && !L) {
    L = await import('leaflet');

    // Fix for default marker icons in Leaflet
    if (L.Icon && L.Icon.Default) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      // Custom bus icon
      busIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/809/809098.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      // Custom student flag icon
      flagIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2540/2540614.png',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });
    }
  }
};

// Default center (you can change this to your default location)
const center: [number, number] = [
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT || "26.1440"),
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG || "91.7360")
];

interface BusLocation {
  busId: string;
  driverUid: string;
  speed: number;
  heading: number;
  timestamp: string;
}

// Route stops removed in live-location-only mode

// Map controller removed

export default function EnhancedBusMap({ 
  routeId,
  role,
  journeyActive = false
}: { 
  routeId: string; 
  role: string;
  journeyActive?: boolean;
}) {
  const { currentLocation: busLocation, history, loading: busLoading, error: busError } = useBusLocation(routeId);
  const { flags: waitingFlags, loading: flagsLoading, error: flagsError, acknowledgeFlag, markAsBoarded } = useWaitingFlags(routeId);
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Route stops and polylines are not used in live-location-only mode
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [zoomLevel, setZoomLevel] = useState(13);

  // Initialize Leaflet icons on mount
  useEffect(() => {
    const initIcons = async () => {
      await initializeLeafletIcons();
    };
    initIcons();
  }, []);

  // In live-location-only mode, we don't fetch route or stops.
  useEffect(() => {
    // Center map on latest bus location if available
    if (busLocation) {
      setMapCenter([26.1440, 91.7360]); // Default center
    }
  }, [busLocation]);

  // Update loading state
  useEffect(() => {
    if (!busLoading && !flagsLoading) {
      setLoading(false);
    }
  }, [busLoading, flagsLoading]);

  // Fallback timeout for loading state
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        console.log('Map loading timeout reached, stopping loading state');
        setLoading(false);
      }, 15000); // 15 seconds timeout

      return () => clearTimeout(timeout);
    }
  }, [loading]);

  // Update error state
  useEffect(() => {
    if (busError || flagsError) {
      console.warn('Map realtime errors (non-critical):', { busError, flagsError });
      setError(busError || flagsError);
    }
  }, [busError, flagsError]);

  console.log('EnhancedBusMap render (live-only):', {
    routeId,
    mapCenter,
    busLocation,
    waitingFlags: waitingFlags.length,
    loading,
    error
  });

  return (
    <div className="relative w-full" style={{ minHeight: '500px' }}>
      {error && !error.includes('straight-line') && (
        <div className="absolute top-2 left-2 right-2 bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded text-sm z-10">
          ⚠️ {error}
        </div>
      )}
      
      {/* Route approximation banner removed in live-only mode */}
      
      {routeId && !journeyActive && (
        <div className="absolute top-12 left-2 right-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg shadow-sm z-10">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
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
      <MapContainer 
        center={mapCenter} 
        zoom={zoomLevel} 
        style={{ height: '500px', width: '100%' }}
        className="rounded-lg z-0"
        zoomControl={true}
        doubleClickZoom={true}
        dragging={true}
        scrollWheelZoom={true}
        touchZoom={true}
        keyboard={true}
        attributionControl={true}
      >
        {/* MapController removed */}
        <TileLayer
          url={process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          attribution={process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        />
        
        {/* Route visualization removed in live-only mode */}
        
        {/* Bus marker - Only show when journey is active */}
        {journeyActive && busLocation && busIcon && (
          <Marker
            position={[26.1440, 91.7360]}
            icon={busIcon}
          >
            <Popup>
              <div className="font-bold">Bus: {busLocation.busId}</div>
              <div>Speed: {busLocation.speed?.toFixed(1) || 0} km/h</div>
              <div>Updated: {new Date(busLocation.timestamp).toLocaleTimeString()}</div>
            </Popup>
          </Marker>
        )}

        {/* Student markers - Only show when journey is active */}
        {journeyActive && waitingFlags.map((flag) => (
          flag.stopLat && flag.stopLng && flagIcon && (
            <Marker
              key={flag.id}
              position={[flag.stopLat, flag.stopLng]}
              icon={flagIcon}
            >
              <Popup>
                <div className="font-bold">Student Waiting</div>
                <div>Name: {flag.studentName}</div>
                <div>Stop: {flag.stopName}</div>
                <div>Status: {flag.status}</div>
                {role === 'driver' && flag.status === 'raised' && (
                  <div className="mt-2 text-sm text-gray-600">
                    <p>Waiting for acknowledgement...</p>
                  </div>
                )}
                {role === 'driver' && flag.status === 'acknowledged' && (
                  <div className="mt-2 text-sm text-green-600">
                    <p>✓ Acknowledged</p>
                  </div>
                )}
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 z-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 bg-white bg-opacity-90 px-3 py-2 rounded text-sm">
        <div>Bus Location: {busLocation ? 'Active' : 'Inactive'}</div>
        <div>Student Flags: {waitingFlags.filter((f) => f.stopLat && f.stopLng).length}</div>
        <div>Zoom: {zoomLevel}</div>
      </div>
    </div>
  );
}