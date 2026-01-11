"use client";

/**
 * UBER-LIKE BUS MAP
 * Minimalist design showing ONLY the live bus location
 * No route lines, no stops - just clean real-time tracking
 */

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useBusLocation } from '@/hooks/useBusLocation';
import { Loader2, Navigation, MapPin, Maximize2, Minimize2, QrCode } from 'lucide-react';
import { Button } from './ui/button';

// Dynamically import Leaflet components
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);

// Map controller to auto-center on bus (only on significant position changes)
function MapController({ busLocation, mapRef }: any) {
  const lastFlyToRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (busLocation && mapRef.current) {
      const map = mapRef.current;
      try {
        if (busLocation.lat && busLocation.lng) {
          // Calculate distance from last flyTo position
          let shouldFly = true;
          if (lastFlyToRef.current) {
            const R = 6371000; // Earth radius in meters
            const dLat = (busLocation.lat - lastFlyToRef.current.lat) * Math.PI / 180;
            const dLon = (busLocation.lng - lastFlyToRef.current.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lastFlyToRef.current.lat * Math.PI / 180) *
              Math.cos(busLocation.lat * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c; // Distance in meters

            // Only fly to new position if moved more than 50 meters
            shouldFly = distance > 50;
          }

          if (shouldFly) {
            map.flyTo([busLocation.lat, busLocation.lng], 15, {
              duration: 1.5,
              easeLinearity: 0.25
            });
            lastFlyToRef.current = { lat: busLocation.lat, lng: busLocation.lng };
          }
        }
      } catch (e) {
        console.debug('Map pan skipped');
      }
    }
  }, [busLocation, mapRef]);

  return null;
}

interface UberLikeBusMapProps {
  busId: string;  // CRITICAL: Use busId for proper isolation
  busNumber?: string;
  journeyActive?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  showStatsOnMobile?: boolean; // If false, stats hidden on mobile
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionColor?: 'red' | 'blue' | 'green' | 'orange';
  studentLocation?: { lat: number; lng: number; accuracy?: number } | null; // Student's own location
  onShowQrCode?: () => void; // Callback to show student's QR code (replaces speed indicator)
}

export default function UberLikeBusMap({
  busId,
  busNumber,
  journeyActive = false,
  isFullScreen = false,
  onToggleFullScreen,
  showStatsOnMobile = false,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionColor = 'orange',
  studentLocation = null,
  onShowQrCode
}: UberLikeBusMapProps) {
  const { currentLocation: busLocation, loading } = useBusLocation(journeyActive ? busId : '');
  const [mapReady, setMapReady] = useState(false);
  const [busIcon, setBusIcon] = useState<any>(null);
  const [studentIcon, setStudentIcon] = useState<any>(null);
  const [waitingTooLong, setWaitingTooLong] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Default center (ADTU Campus area)
  const defaultCenter: [number, number] = [26.1445, 91.7362];
  const mapCenter: [number, number] = (busLocation && busLocation.lat && busLocation.lng)
    ? [busLocation.lat, busLocation.lng]
    : defaultCenter;

  // Stable key for MapContainer - only change if busId changes
  const mapKey = `map-${busId}`;

  // Handle Fullscreen Transitions & Map State
  useEffect(() => {
    // Safety check: Don't run if map isn't ready or journey is inactive
    if (!mapRef.current || !journeyActive) return;

    const timer = setTimeout(() => {
      const map = mapRef.current;
      // Double-check map validity inside timeout
      if (map && !map._mapPane) return; // Map might be destroyed

      try {
        if (map) {
          map.invalidateSize();
          // If we have a location, pan to it to prevent "lost marker" issue
          if (busLocation && busLocation.lat && busLocation.lng) {
            map.panTo([busLocation.lat, busLocation.lng], { animate: true, duration: 0.5 });
          }
        }
      } catch (error) {
        console.debug('Map operation skipped:', error);
      }
    }, 300);

    // Cleanup: Clear timeout to prevent execution after unmount/state change
    return () => clearTimeout(timer);
  }, [isFullScreen, busLocation, journeyActive]);

  // Initialize custom icons
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initIcons = async () => {
      try {
        const leafletModule = await import('leaflet');
        const L = leafletModule.default || leafletModule;

        // Premium 3D Bus icon (Consistent with Driver UI)
        const busIconElement = L.divIcon({
          className: 'custom-bus-marker',
          html: `
            <div style="position: relative; filter: drop-shadow(0px 10px 6px rgba(0,0,0,0.3));">
              <div style="
                background: linear-gradient(135deg, #2563EB 0%, #1E40AF 100%);
                width: 52px;
                height: 52px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                position: relative;
                z-index: 2;
              ">
                <span style="font-size: 26px;">🚌</span>
              </div>
              
              <!-- 3D Depth Effect / Pointer -->
              <div style="
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 12px solid transparent;
                border-right: 12px solid transparent;
                border-top: 14px solid #1E40AF;
                z-index: 1;
              "></div>
              
              <!-- Pulsing Ring -->
              <div style="
                 position: absolute;
                 top: 50%;
                 left: 50%;
                 transform: translate(-50%, -50%);
                 width: 100%;
                 height: 100%;
                 border-radius: 50%;
                 border: 2px solid #3B82F6;
                 animation: pulse-ring 2s infinite;
                 z-index: 0;
              "></div>
            </div>
            <style>
              @keyframes pulse-ring {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
                100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
              }
            </style>
          `,
          iconSize: [52, 60],
          iconAnchor: [26, 60],
          popupAnchor: [0, -60],
        });

        // Student location icon
        const studentIconElement = L.divIcon({
          className: 'custom-student-marker',
          html: `
            <div style="
              background: linear-gradient(135deg, #10B981 0%, #059669 100%);
              width: 40px;
              height: 40px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
              border: 3px solid white;
            ">
              <span style="font-size: 20px;">📍</span>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -20],
        });

        setBusIcon(busIconElement);
        setStudentIcon(studentIconElement);
        console.log('✅ Uber-style icons initialized');
      } catch (error) {
        console.error('❌ Error initializing icons:', error);
      }
    };

    initIcons();
  }, []);

  // Timeout to detect if waiting too long for bus location (30 seconds)
  useEffect(() => {
    if (!busLocation && journeyActive && !loading) {
      const timeout = setTimeout(() => {
        setWaitingTooLong(true);
        console.warn('⏰ Waiting too long for bus location - driver may not be sharing location');
      }, 30000); // 30 seconds

      return () => clearTimeout(timeout);
    } else {
      setWaitingTooLong(false);
    }
  }, [busLocation, journeyActive, loading]);

  // Show loading state
  if (!journeyActive) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-gradient-to-br from-blue-100/20 to-purple-100/20"></div>
        </div>

        {/* Floating Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400 rounded-full animate-ping opacity-40"></div>
          <div className="absolute top-1/2 right-1/3 w-2 h-2 bg-purple-400 rounded-full animate-ping opacity-40" style={{ animationDelay: '0.7s' }}></div>
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-indigo-400 rounded-full animate-ping opacity-40" style={{ animationDelay: '1.4s' }}></div>
        </div>

        {/* Mobile-responsive padding and sizing */}
        <div className="text-center p-6 md:p-8 py-10 md:py-8 relative z-10 max-w-sm mx-auto">
          <div className="relative mb-6 md:mb-8">
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto bg-gradient-to-br from-blue-500 via-purple-600 to-indigo-700 rounded-full flex items-center justify-center shadow-2xl animate-pulse">
              <MapPin className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-gray-800">⏳</span>
            </div>
          </div>
          <h3 className="text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-3 md:mb-4">
            Waiting for Bus
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base lg:text-lg leading-relaxed">
            Trip hasn't started yet. You'll see live tracking once the driver begins the journey.
          </p>

          {/* Status indicator */}
          <div className="mt-5 md:mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-sm font-medium">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
            Trip Inactive
          </div>
        </div>
      </div>
    );
  }

  if (loading && !busLocation) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-gradient-to-br from-blue-100/20 to-purple-100/20"></div>
        </div>

        {/* Animated Elements */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-blue-400 rounded-full animate-ping opacity-60"></div>
          <div className="absolute top-1/2 right-1/3 w-2 h-2 bg-purple-400 rounded-full animate-ping opacity-60" style={{ animationDelay: '0.7s' }}></div>
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-indigo-400 rounded-full animate-ping opacity-60" style={{ animationDelay: '1.4s' }}></div>
        </div>

        <div className="text-center relative z-10 max-w-sm mx-auto px-6">
          <div className="relative mb-8">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 via-purple-600 to-indigo-700 rounded-full flex items-center justify-center shadow-2xl">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center animate-pulse">
              <span className="text-xs font-bold text-white">📡</span>
            </div>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-4">
            Connecting to Bus
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-base md:text-lg leading-relaxed mb-6">
            Establishing real-time connection...
          </p>

          {/* Progress indicator */}
          <div className="w-full max-w-xs mx-auto">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-full animate-pulse shadow-lg" style={{ width: '60%' }}></div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Searching for live location...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-slate-100 dark:bg-slate-900">
      {/* Optimized top overlay with bus info */}
      {busLocation && (
        <div className={`absolute top-3 left-3 ${isFullScreen ? 'right-20' : 'right-3'} z-[1000] pointer-events-none transition-all duration-300 ${!showStatsOnMobile ? 'hidden md:block' : ''}`}>
          <div className="bg-white/95 dark:bg-gray-900/95 rounded-2xl shadow-lg p-4 backdrop-blur-sm border border-white/20 dark:border-gray-700/20 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 w-full">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shrink-0">
                  <span className="text-2xl">🚌</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Bus Number</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    {busNumber || busLocation.busId || 'Unknown'}
                  </p>
                </div>
              </div>
            </div>

            {/* Optimized Live indicator */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  Live Tracking
                </span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Updated: {new Date(busLocation.timestamp || Date.now()).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <MapContainer
        key={mapKey}
        center={mapCenter as [number, number]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        className="z-0 bg-slate-100 dark:bg-slate-900"
        zoomControl={false}
        attributionControl={false}
        ref={(mapInstance: any) => {
          if (mapInstance) {
            mapRef.current = mapInstance;
            setTimeout(() => {
              setMapReady(true);
            }, 300);
          }
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          minZoom={1}
        />

        {/* Auto-center controller */}
        {busLocation && <MapController busLocation={busLocation} mapRef={mapRef} />}

        {/* Bus marker with accuracy circle */}
        {busLocation && busIcon && mapReady && (
          <>
            {/* Accuracy radius */}
            <Circle
              center={[busLocation.lat, busLocation.lng]}
              radius={busLocation.accuracy || 50}
              pathOptions={{
                fillColor: '#3B82F6',
                fillOpacity: 0.1,
                color: '#3B82F6',
                weight: 1,
                opacity: 0.3,
              }}
            />

            {/* Bus marker */}
            <Marker position={[busLocation.lat, busLocation.lng]} icon={busIcon}>
              <Popup>
                <div className="text-center p-2">
                  <p className="font-bold text-lg mb-2">🚌 Your Bus</p>
                  <div className="space-y-1 text-sm">
                    <p><strong>Speed:</strong> {((busLocation.speed || 0) * 3.6).toFixed(1)} km/h</p>
                    <p><strong>Accuracy:</strong> {(busLocation.accuracy || 0).toFixed(0)}m</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(busLocation.timestamp || Date.now()).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Student location marker */}
        {studentLocation && studentLocation.lat && studentLocation.lng && studentIcon && mapReady && (
          <>
            {/* Student accuracy radius */}
            <Circle
              center={[studentLocation.lat, studentLocation.lng]}
              radius={studentLocation.accuracy || 30}
              pathOptions={{
                fillColor: '#10B981',
                fillOpacity: 0.15,
                color: '#10B981',
                weight: 2,
                opacity: 0.5,
              }}
            />

            {/* Student marker */}
            <Marker position={[studentLocation.lat, studentLocation.lng]} icon={studentIcon}>
              <Popup>
                <div className="text-center p-2">
                  <p className="font-bold text-lg mb-1">📍 You are here</p>
                  <p className="text-xs text-gray-500">Accuracy: {(studentLocation.accuracy || 0).toFixed(0)}m</p>
                </div>
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      {/* Floating Map Controls (Right Side) */}
      <div className={`absolute z-[1000] flex flex-col gap-2 ${isFullScreen ? 'bottom-32 right-4' : 'bottom-4 right-4'}`}>
        {/* Re-center button (Top) - Always visible, disabled when no location */}
        <button
          onClick={() => {
            if (mapRef.current && busLocation && busLocation.lat && busLocation.lng) {
              mapRef.current.flyTo([busLocation.lat, busLocation.lng], 16, {
                duration: 1.2,
                easeLinearity: 0.25
              });
            }
          }}
          disabled={!busLocation}
          className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${busLocation
            ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white hover:scale-105 cursor-pointer'
            : 'bg-gray-400 cursor-not-allowed opacity-60'
            }`}
          title={busLocation ? "Center on bus" : "Waiting for bus location..."}
        >
          <Navigation className="w-5 h-5" />
        </button>

        {/* Zoom Controls (Grouped) */}
        <div className="flex flex-col rounded-full shadow-lg overflow-hidden bg-white/95 dark:bg-gray-900/95 border border-white/20 dark:border-gray-700/20 backdrop-blur-sm">
          <button
            onClick={() => {
              if (mapRef.current) mapRef.current.zoomIn();
            }}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-200 dark:border-gray-700"
          >
            <span className="text-xl font-bold text-gray-900 dark:text-white">+</span>
          </button>
          <button
            onClick={() => {
              if (mapRef.current) mapRef.current.zoomOut();
            }}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-xl font-bold text-gray-900 dark:text-white">−</span>
          </button>
        </div>

        {/* Full Screen Toggle (Bottom) - only show when not in fullscreen */}
        {onToggleFullScreen && !isFullScreen && (
          <button
            onClick={onToggleFullScreen}
            className="w-10 h-10 bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform duration-200"
            title="Full Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating Exit Fullscreen Button (Top-Right, always visible in fullscreen) */}
      {isFullScreen && onToggleFullScreen && (
        <button
          onClick={onToggleFullScreen}
          className="absolute top-4 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 text-gray-700 dark:text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all duration-200 border border-gray-200 dark:border-gray-700"
          title="Exit Full Screen"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      )}

      {/* QR Code Button OR Speed Indicator - Floating below Exit Button (Top-20) */}
      {isFullScreen && (
        onShowQrCode ? (
          /* Show QR Code Button for students */
          <button
            onClick={onShowQrCode}
            className="absolute top-20 right-4 z-[1001] w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center border-2 border-white dark:border-gray-700 hover:scale-110 transition-transform duration-200"
            title="Show my QR Code"
          >
            <QrCode className="w-6 h-6 text-white" />
          </button>
        ) : busLocation ? (
          /* Show Speed Indicator for drivers */
          <div className="absolute top-20 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex flex-col items-center justify-center border-2 border-white dark:border-gray-700">
            <span className="text-sm font-bold text-gray-900 dark:text-white leading-none">
              {((busLocation.speed || 0) * 3.6).toFixed(0)}
            </span>
            <span className="text-[8px] text-gray-500 font-medium leading-none mt-0.5">km/h</span>
          </div>
        ) : null
      )}

      {/* Sticky Bottom Action Bar (Full Screen Only) - Transparent */}
      {isFullScreen && primaryActionLabel && onPrimaryAction && (
        <div className="absolute bottom-8 left-4 right-4 z-[1000]">
          <Button
            onClick={onPrimaryAction}
            className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg ${primaryActionColor === 'red' ? 'bg-red-600 hover:bg-red-700 text-white' :
              primaryActionColor === 'blue' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                primaryActionColor === 'green' ? 'bg-green-600 hover:bg-green-700 text-white' :
                  'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
          >
            {primaryActionLabel}
          </Button>
        </div>
      )}

      {/* Optimized No bus location warning */}
      {!busLocation && journeyActive && !loading && (
        <div className="absolute inset-0 bg-black/60 z-[999] flex items-center justify-center p-4">
          <div className="bg-white/95 dark:bg-gray-900/95 rounded-3xl p-8 max-w-sm mx-4 text-center shadow-lg backdrop-blur-sm border border-white/20 dark:border-gray-700/20">
            <div className="relative mb-6">
              <div className={`w-20 h-20 bg-gradient-to-br ${waitingTooLong ? 'from-red-400 to-red-600' : 'from-yellow-400 to-orange-500'} rounded-full flex items-center justify-center mx-auto shadow-xl`}>
                <MapPin className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-xs font-bold text-white">!</span>
              </div>
            </div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-3">
              {waitingTooLong ? 'Driver Not Sharing Location' : 'Searching for Bus...'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
              {waitingTooLong
                ? 'The driver may not have enabled location sharing or the app may be closed. Please wait or contact the driver.'
                : 'Waiting for the bus to share its location. This may take a moment.'}
            </p>

            {/* Status indicator */}
            <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full ${waitingTooLong
              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
              } text-sm font-medium`}>
              <div className={`w-2 h-2 ${waitingTooLong ? 'bg-red-500' : 'bg-yellow-500'} rounded-full animate-pulse`}></div>
              {waitingTooLong ? 'Location Unavailable' : 'Searching...'}
            </div>

            {waitingTooLong && (
              <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>💡 <strong>Possible reasons:</strong></p>
                <ul className="text-left list-disc list-inside space-y-0.5">
                  <li>Driver's app is closed or in background</li>
                  <li>Driver hasn't enabled location permissions</li>
                  <li>Poor network connection</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
