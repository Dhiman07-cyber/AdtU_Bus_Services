"use client";

import { useState, useEffect } from "react";

export default function MapLive({ routeId, busId }: { routeId: string; busId: string }) {
  return (
    <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
      <div className="text-center">
        <div className="text-xl font-bold text-gray-700 mb-2">Live Bus Tracking Map</div>
        <div className="text-gray-500">Route: {routeId}</div>
        <div className="text-gray-500">Bus: {busId}</div>
        <div className="mt-4 text-sm text-gray-400">
          Map functionality will be implemented with Leaflet integration
        </div>
      </div>
    </div>
  );
}
