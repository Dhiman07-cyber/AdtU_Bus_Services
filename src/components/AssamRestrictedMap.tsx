"use client";

/**
 * ASSAM-RESTRICTED EMPTY MAP
 * 
 * Features:
 * - Map bounds restricted to Assam state only
 * - Completely EMPTY by default (no markers, no lines)
 * - All markers/polylines are DYNAMIC (added only when data exists)
 * - Max bounds prevent scrolling outside Assam
 */

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Dynamic imports to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.MapContainer };
}), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.TileLayer };
}), { ssr: false });


// Leaflet initialization
let L: any = null;

const initializeLeaflet = async () => {
  if (typeof window !== 'undefined' && !L) {
    L = await import('leaflet');

    // Fix default marker icons - only on client side
    if (L.Icon && L.Icon.Default) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });
    }
  }
};


// Assam state boundaries (approximate)
// Assam spans roughly: 24°-28°N latitude, 89°-96°E longitude
const ASSAM_BOUNDS: [number, number][] = [
  [24.0, 89.0], // Southwest corner
  [28.5, 96.5]  // Northeast corner
];

// Default center: Guwahati
const ASSAM_CENTER: [number, number] = [26.1445, 91.7362];

// Guwahati city bounds (tighter default for urban area)
const GUWAHATI_BOUNDS: [number, number][] = [
  [25.95, 91.55],
  [26.25, 92.05]
];



export interface AssamMapProps {
  children?: React.ReactNode;
  bounds?: L.LatLngBoundsExpression;
  restrictToGuwahati?: boolean; // Tighter bounds for city-only
  className?: string;
  style?: React.CSSProperties;
  zoom?: number;
}

/**
 * Assam-Restricted Empty Map Component
 * 
 * Usage:
 * <AssamRestrictedMap>
 *   {tripActive && <Polyline positions={route} />}
 *   {tripActive && stops.map(s => <Marker position={[s.lat, s.lng]} />)}
 * </AssamRestrictedMap>
 */
export default function AssamRestrictedMap({
  children,
  bounds,
  restrictToGuwahati = false,
  className = '',
  style,
  zoom = 13
}: AssamMapProps) {
  // Initialize Leaflet on mount
  useEffect(() => {
    const initLeaflet = async () => {
      await initializeLeaflet();
    };
    initLeaflet();
  }, []);

  // Use tighter Guwahati bounds if requested, otherwise full Assam
  const maxBounds = restrictToGuwahati ? GUWAHATI_BOUNDS : ASSAM_BOUNDS;
  const defaultCenter = ASSAM_CENTER;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={zoom}
        style={style || { height: '100%', width: '100%', minHeight: '500px' }}
        className={`rounded-lg ${className}`}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0} // Prevents dragging outside bounds
        minZoom={10} // Prevent zooming out too far
        maxZoom={18}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        dragging={true}
        touchZoom={true}
        whenReady={() => {
          // Handle map initialization when ready
          try {
            // Force recalculate size
            setTimeout(() => {
              // Map will be available through ref if needed
            }, 100);

            // Set max bounds to restrict scrolling to Assam
            if (maxBounds) {
              // Map bounds are already set via props
              // Additional bounds enforcement can be added here if needed
            }

            // Fit to bounds if provided
            if (bounds) {
              // Bounds will be handled by MapContainer props
            } else if (!bounds && defaultCenter && zoom) {
              // Center and zoom are handled by MapContainer props
            }
          } catch (error) {
            console.warn('Error setting up map:', error);
          }
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Children are ONLY rendered when provided (dynamic content) */}
        {children}
      </MapContainer>
    </div>
  );
}

/**
 * Custom icons for different marker types
 * Lazy-loaded to ensure Leaflet is initialized first
 */
let MapIcons: any = null;

const getMapIcons = () => {
  if (!MapIcons && L) {
    MapIcons = {
      bus: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/809/809098.png',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      }),
      
      stop: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/484/484167.png',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
      }),
      
      stopApproximate: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/484/484167.png',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
        className: 'opacity-50' // Visual indication of approximate location
      }),
      
      waitingFlag: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2540/2540614.png',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
      }),
      
      waitingFlagAcknowledged: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/5610/5610944.png',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
      }),
      
      student: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      }),
      
      waitingFlagOther: L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2540/2540614.png',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -26],
        className: 'opacity-70'
      })
    };
  }
  return MapIcons;
};

export { getMapIcons as MapIcons };

/**
 * Polyline styles for different route states
 */
export const PolylineStyles = {
  active: {
    color: '#3b82f6',
    weight: 5,
    opacity: 0.8
  },
  
  fallback: {
    color: '#f59e0b',
    weight: 4,
    opacity: 0.7,
    dashArray: '10, 10' // Dashed line
  },
  
  approximate: {
    color: '#ef4444',
    weight: 3,
    opacity: 0.5,
    dashArray: '5, 10'
  }
};











