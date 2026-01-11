"use client";

/**
 * UBER-LIKE DRIVER MAP - REDESIGNED
 * Features:
 * - Premium 3D Markers
 * - Mobile-First UI
 * - Sticky Bottom Controls
 * - Slide-out Waiting Panel
 */

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { Loader2, Navigation, Users, MapPin, CheckCircle, UserCheck, Maximize2, Minimize2, AlertCircle, Bell, X, ChevronUp, ChevronRight, Bus, ScanLine } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

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
const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
);

interface WaitingStudent {
  id: string;
  student_uid: string;
  student_name: string;
  stop_lat?: number;
  stop_lng?: number;
  accuracy: number;
  stop_name?: string;
  message?: string;
  status: 'waiting' | 'acknowledged' | 'boarded' | 'raised';
  created_at: string;
  distance?: number;
  queue_number?: number; // Queue number for numbered marker display (1, 2, 3, etc.)
}

interface UberLikeDriverMapProps {
  driverLocation: { lat: number; lng: number; accuracy: number } | null;
  waitingStudents: WaitingStudent[];
  tripActive: boolean;
  busNumber?: string;
  routeName?: string;
  speed?: number;
  accuracy?: number;
  onAcknowledgeStudent?: (studentId: string) => void;
  onMarkBoarded?: (studentId: string) => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  showStatsOnMobile?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionColor?: 'red' | 'blue' | 'green';
  onQrScan?: () => void;
}

export default function UberLikeDriverMap({
  driverLocation,
  waitingStudents = [],
  tripActive,
  busNumber,
  routeName,
  speed = 0,
  accuracy = 50,
  onAcknowledgeStudent,
  onMarkBoarded,
  isFullScreen = false,
  onToggleFullScreen,
  showStatsOnMobile = false,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionColor = 'red',
  onQrScan
}: UberLikeDriverMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const [driverIcon, setDriverIcon] = useState<any>(null);
  const [studentIcon, setStudentIcon] = useState<any>(null);
  const [acknowledgedIcon, setAcknowledgedIcon] = useState<any>(null);
  const [leafletRef, setLeafletRef] = useState<any>(null); // Store Leaflet reference for dynamic icons
  const mapRef = useRef<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // UI State for Fullscreen Waiting Panel
  const [isWaitingPanelOpen, setIsWaitingPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Function to create numbered student marker icon
  const createNumberedStudentIcon = (queueNumber: number, isAcknowledged: boolean) => {
    if (!leafletRef) return studentIcon;

    const bgColor = isAcknowledged
      ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
      : 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)';

    return leafletRef.divIcon({
      className: 'custom-numbered-student-marker',
      html: `
        <div style="position: relative; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.3));">
          <div style="
            background: ${bgColor};
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 3px solid white;
          ">
            <span style="color: white; font-size: 18px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">${queueNumber}</span>
          </div>
          <!-- Bottom pointer for 3D effect -->
          <div style="
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-top: 10px solid ${isAcknowledged ? '#059669' : '#EA580C'};
          "></div>
          ${!isAcknowledged ? `
          <!-- Pulsing ring for unacknowledged students -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid #F97316;
            animation: pulse-student 2s infinite;
          "></div>
          ` : ''}
        </div>
        <style>
          @keyframes pulse-student {
            0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
            100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
          }
        </style>
      `,
      iconSize: [44, 54],
      iconAnchor: [22, 54],
      popupAnchor: [0, -54],
    });
  };

  // Detect mobile device to handle map interactions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Default center (ADTU Campus area)
  const defaultCenter: [number, number] = [26.1445, 91.7362];
  const mapCenter: [number, number] = (driverLocation && driverLocation.lat && driverLocation.lng)
    ? [driverLocation.lat, driverLocation.lng]
    : defaultCenter;

  // Calculate actual distance using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  // Calculate distances to students
  const studentsWithDistance = waitingStudents.map(student => {
    if (!driverLocation || !driverLocation.lat || !driverLocation.lng || !student.stop_lat || !student.stop_lng) {
      return { ...student, distance: undefined };
    }

    const distance = calculateDistance(
      driverLocation.lat,
      driverLocation.lng,
      student.stop_lat,
      student.stop_lng
    );

    return { ...student, distance };
  }).sort((a, b) => (a.distance || 999) - (b.distance || 999));

  // Handle Fullscreen Transitions & Map State
  useEffect(() => {
    // Safety check
    if (!mapRef.current || !tripActive) return;

    const timer = setTimeout(() => {
      const map = mapRef.current;
      if (map && !map._mapPane) return;

      try {
        if (map) {
          map.invalidateSize();
          if (driverLocation && driverLocation.lat && driverLocation.lng) {
            map.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 0.5 });
          }
        }
      } catch (error) {
        console.debug('Map operation skipped:', error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isFullScreen, driverLocation, tripActive]);

  // Initialize custom icons
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initIcons = async () => {
      try {
        const leafletModule = await import('leaflet');
        const L = leafletModule.default || leafletModule;

        // Premium 3D Bus icon
        const driverIconElement = L.divIcon({
          className: 'custom-driver-marker',
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

        // Waiting Student icon
        const studentIconElement = L.divIcon({
          className: 'custom-student-marker',
          html: `
            <div style="position: relative;">
              <div style="
                background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                border: 2px solid white;
              ">
                <span style="font-size: 20px;">👤</span>
              </div>
              <div style="
                position: absolute;
                top: -4px;
                right: -4px;
                background: #DC2626;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid white;
              "></div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -20],
        });

        // Acknowledged Student icon
        const acknowledgedIconElement = L.divIcon({
          className: 'custom-acknowledged-marker',
          html: `
              <div style="position: relative;">
                <div style="
                  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                  width: 40px;
                  height: 40px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                  border: 2px solid white;
                ">
                  <span style="font-size: 20px;">✓</span>
                </div>
              </div>
            `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          popupAnchor: [0, -20],
        });

        setDriverIcon(driverIconElement);
        setStudentIcon(studentIconElement);
        setAcknowledgedIcon(acknowledgedIconElement);
        setLeafletRef(L); // Store Leaflet reference for dynamic numbered icons
      } catch (error) {
        console.error('❌ Error initializing icons:', error);
      }
    };

    initIcons();
  }, []);

  // Auto-center on driver location
  useEffect(() => {
    if (driverLocation && mapRef.current && tripActive) {
      try {
        if (driverLocation.lat && driverLocation.lng) {
          mapRef.current.flyTo([driverLocation.lat, driverLocation.lng], 16, {
            duration: 1,
            easeLinearity: 0.25
          });
        }
      } catch (e) {
        console.debug('Map pan skipped');
      }
    }
  }, [driverLocation, tripActive]);

  if (!tripActive) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center">
        <div className="text-center p-6">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Location Inactive
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Start the trip to view the map
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-slate-100 dark:bg-slate-900">

      {/* --- REDESIGNED TOP STAT CARD --- */}
      {showStatsOnMobile && (
        <div className={`absolute top-4 left-4 ${isFullScreen ? 'right-20' : 'right-4'} z-[1000] transition-all duration-300 pointer-events-none`}>
          <div className="bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-xl p-3 backdrop-blur-lg border border-gray-100 dark:border-gray-800 pointer-events-auto">
            {/* ROW 1: Bus Identity */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <Bus className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Vehicle</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {busNumber || 'Bus'}
                </p>
              </div>
            </div>

            {/* ROW 2: Metrics Split */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase">Speed</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400 leading-none">
                  {(speed * 3.6).toFixed(0)} <span className="text-xs font-normal text-gray-400">km/h</span>
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase">GPS</p>
                <p className={`text-xl font-bold leading-none ${accuracy <= 20 ? 'text-green-500' : 'text-orange-500'}`}>
                  {accuracy?.toFixed(0)} <span className="text-xs font-normal text-gray-400">m</span>
                </p>
              </div>
            </div>

            {/* ROW 3: Status Pill */}
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-full px-3 py-1.5 w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">Trip Active</span>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING CONTROLS --- */}

      {/* Top Right Controls (Fullscreen Only) */}
      {isFullScreen && (
        <>
          {/* Exit Fullscreen Button - Top Right (Aligned with Left Card) */}
          {onToggleFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="absolute top-4 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 text-gray-700 dark:text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border2 border-white dark:border-gray-700"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          )}

          {/* Waiting Students Bell - Below Exit Button (Aligned with Student Speed Bubble) */}
          <button
            onClick={() => setIsWaitingPanelOpen(true)}
            className="absolute top-20 right-4 z-[999] w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center border-2 border-white dark:border-gray-700 transition-transform active:scale-95"
          >
            <div className="relative flex items-center justify-center w-full h-full">
              {/* Count only unacknowledged flags for the badge */}
              {(() => {
                const unacknowledgedCount = waitingStudents.filter(s => s.status !== 'acknowledged').length;
                return (
                  <>
                    <Bell className={`w-6 h-6 ${unacknowledgedCount > 0 ? 'text-orange-500 fill-orange-500 animate-pulse' : waitingStudents.length > 0 ? 'text-green-500' : 'text-gray-400'}`} />
                    <span className={`absolute -top-1 -right-1 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-sm ${unacknowledgedCount > 0 ? 'bg-red-500 text-white' : waitingStudents.length > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                      {unacknowledgedCount > 0 ? unacknowledgedCount : waitingStudents.length}
                    </span>
                  </>
                );
              })()}
            </div>
          </button>

          {/* QR Code Scanner Button - Below Bell */}
          <button
            onClick={onQrScan}
            className="absolute top-36 right-4 z-[999] w-12 h-12 bg-white dark:bg-gray-800 text-gray-700 dark:text-white rounded-full shadow-lg flex items-center justify-center border-2 border-white dark:border-gray-700 transition-transform active:scale-95 hover:bg-gray-50"
          >
            <ScanLine className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </button>
        </>
      )}

      {/* --- MAP COMPONENT --- */}
      <MapContainer
        key={tripActive ? `active-map-${tripActive}` : "inactive-map"}
        center={mapCenter as [number, number]}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        className="z-0 bg-slate-100 dark:bg-slate-900"
        zoomControl={false}
        attributionControl={false}
        // Enable interactions
        dragging={true}
        touchZoom={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        ref={(map) => {
          if (map) {
            mapRef.current = map;
            setMapReady(true);
          } else {
            // Cleanup when map unmounts
            mapRef.current = null;
            setMapReady(false);
          }
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          minZoom={1}
        />

        {/* Driver Marker - Only render if icon is ready */}
        {driverLocation && driverIcon && mapReady && (
          <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon}>
            <Popup className="premium-popup">
              <div className="text-center p-1">
                <p className="font-bold text-sm">You are here</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Student Markers with Queue Numbers - Only render if icons are ready */}
        {mapReady && driverIcon && studentIcon && studentsWithDistance.map((student, index) => {
          // Calculate queue number (1-indexed)
          const queueNumber = student.queue_number || (index + 1);
          const isAcknowledged = student.status === 'acknowledged';

          // Use numbered icon if leaflet is available, fallback to default icons
          const markerIcon = leafletRef
            ? createNumberedStudentIcon(queueNumber, isAcknowledged)
            : (isAcknowledged ? acknowledgedIcon : studentIcon);

          if (!markerIcon) return null; // Safety check

          return student.stop_lat && student.stop_lng && (
            <Marker
              key={student.id}
              position={[student.stop_lat, student.stop_lng]}
              icon={markerIcon}
            >
              <Popup>
                <div className="p-2 min-w-[180px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${isAcknowledged ? 'bg-green-500' : 'bg-orange-500'}`}>
                      {queueNumber}
                    </span>
                    <p className="font-bold text-base">
                      {student.student_name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{student.stop_name || 'Stop Location'}</p>
                  {student.distance !== undefined && (
                    <p className="text-xs text-blue-600 font-medium mb-3">
                      {(student.distance * 1000).toFixed(0)}m away
                    </p>
                  )}
                  <div className="flex gap-2">
                    {(student.status === 'waiting' || student.status === 'raised') ? (
                      <Button size="sm" className="w-full h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={() => onAcknowledgeStudent?.(student.id)}>
                        Acknowledge
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs bg-green-50 text-green-700 border-green-200" onClick={() => onMarkBoarded?.(student.id)}>
                        <span className="mr-1">✓</span> Picked Up
                      </Button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Route Line (Driver -> First Student) */}
        {driverLocation && studentsWithDistance.length > 0 && studentsWithDistance[0].status === 'waiting' && studentsWithDistance[0].stop_lat && (
          <Polyline
            positions={[
              [driverLocation.lat, driverLocation.lng],
              [studentsWithDistance[0].stop_lat!, studentsWithDistance[0].stop_lng!]
            ]}
            pathOptions={{
              color: '#F97316',
              weight: 4,
              opacity: 0.5,
              dashArray: '10, 10'
            }}
          />
        )}
      </MapContainer>

      {/* --- BOTTOM CONTROLS & ACTION BAR --- */}

      {/* Floating Map Controls (Right Side) */}
      <div className={`absolute z-[1000] flex flex-col gap-3 ${isFullScreen ? 'bottom-32 right-4' : 'bottom-6 right-4'}`}>
        {/* Recenter */}
        <button
          onClick={() => {
            if (mapRef.current && driverLocation) {
              mapRef.current.flyTo([driverLocation.lat, driverLocation.lng], 17);
            }
          }}
          className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Navigation className="w-5 h-5 fill-current" />
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

        {/* Fullscreen Toggle (Non-FS only) */}
        {!isFullScreen && onToggleFullScreen && (
          <button
            onClick={onToggleFullScreen}
            className="w-10 h-10 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sticky Bottom Action Button (FS Only) - No Container */}
      {isFullScreen && primaryActionLabel && onPrimaryAction && (
        <div className="absolute bottom-8 left-4 right-4 z-[1000]">
          <Button
            onClick={onPrimaryAction}
            className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg ${primaryActionColor === 'red' ? 'bg-red-600 hover:bg-red-700 text-white' :
              primaryActionColor === 'green' ? 'bg-green-600 hover:bg-green-700 text-white' :
                'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
          >
            {primaryActionLabel}
          </Button>
        </div>
      )}
      {isFullScreen && (
        <>
          {/* Backdrop */}
          {isWaitingPanelOpen && (
            <div
              className="absolute inset-0 bg-black/40 z-[1001] backdrop-blur-sm transition-opacity"
              onClick={() => setIsWaitingPanelOpen(false)}
            />
          )}

          {/* Drawer */}
          <div className={`
               absolute bottom-0 left-0 right-0 z-[1002] 
               bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl 
               transition-transform duration-300 ease-out transform
               ${isWaitingPanelOpen ? 'translate-y-0' : 'translate-y-full'}
            `}
            style={{ maxHeight: '70vh' }}
          >
            <div className="p-2 pb-0 flex justify-center" onClick={() => setIsWaitingPanelOpen(false)}>
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
            </div>

            <div className="p-6 pt-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-500" />
                  Waiting List
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">
                    {waitingStudents.length}
                  </Badge>
                </h3>
                <button onClick={() => setIsWaitingPanelOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[50vh] pb-8 pr-1">
                {studentsWithDistance.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No students waiting currently.</p>
                  </div>
                ) : (
                  studentsWithDistance.map((student) => (
                    <div key={student.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold border-2 border-white shadow-sm">
                          {student.student_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{student.student_name}</p>
                          <p className="text-xs text-gray-500">{student.distance ? `${student.distance.toFixed(1)} km away` : 'Waiting'}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          onAcknowledgeStudent?.(student.id);
                          // Optional: Close panel or keep open
                        }}
                        className={`${student.status === 'acknowledged' ? 'bg-green-600' : 'bg-orange-500'} text-white shadow-md`}
                      >
                        {student.status === 'acknowledged' ? <CheckCircle className="w-4 h-4" /> : 'Acknowledge'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
