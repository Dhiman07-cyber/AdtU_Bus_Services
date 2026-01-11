/**
 * Utility functions for formatting display values
 */

export interface BusData {
  id?: string;
  busId?: string;
  busNumber?: string;
  licensePlate?: string;
  plateNumber?: string;
  displayIndex?: number;
  sequenceNumber?: number;
  index?: number;
}

/**
 * Format bus assignment for display
 * Returns format: Bus-X (plate_number)
 * Example: Bus-6 (AS-01-FC-7127)
 */
export function formatBusAssignment(
  busId: string | null | undefined,
  buses: BusData[] = []
): string {
  if (!busId) return 'Not Assigned';

  console.log('formatBusAssignment called with busId:', busId, 'buses count:', buses.length);

  // Try to find the bus in the provided array with multiple matching strategies
  // First try exact match
  let bus = buses.find(b => {
    const matches = b.id === busId || b.busId === busId;
    if (matches) {
      console.log('Found bus by exact match:', b);
    }
    return matches;
  });
  
  // If not found, try matching by extracting number from busId (e.g., "bus_6" -> 6)
  if (!bus) {
    const extractedNum = extractBusNumber(busId);
    console.log('Extracted number from busId:', extractedNum);
    
    if (extractedNum !== null) {
      bus = buses.find(b => {
        // Check if this bus has the same number
        const busNumFromId = extractBusNumber(b.id || '');
        const busNumFromBusId = extractBusNumber(b.busId || '');
        const matches = busNumFromId === extractedNum || busNumFromBusId === extractedNum;
        
        if (matches) {
          console.log('Found bus by number extraction:', b);
        }
        return matches;
      });
    }
  }

  if (bus) {
    // Extract bus number - try multiple approaches
    let busNum: number | null = null;
    
    // Priority 1: Check displayIndex, sequenceNumber, index fields
    busNum = bus.displayIndex ?? bus.sequenceNumber ?? bus.index ?? null;
    
    // Priority 2: Extract from busId or id
    if (busNum === null) {
      busNum = extractBusNumber(bus.busId || '') || extractBusNumber(bus.id || '') || extractBusNumber(busId);
    }
    
    console.log('Determined bus number:', busNum);
    
    // Get the plate number - check all possible field names
    // Priority order: licensePlate > plateNumber > specific bus fields
    let plate = '';
    
    // Try direct fields
    plate = bus.licensePlate || bus.plateNumber || '';
    
    // If still empty, check if busNumber looks like a plate (contains letters and dashes)
    if (!plate && bus.busNumber && bus.busNumber.match(/^[A-Z]{2}-\d{2}/)) {
      plate = bus.busNumber;
    }
    
    // Check other possible fields
    if (!plate) {
      plate = (bus as any).registration || (bus as any).registrationNumber || (bus as any).vehicleNumber || '';
    }
    
    console.log('Determined plate:', plate);
    
    // Format the output
    if (busNum !== null && plate && plate.match(/^[A-Z]{2}-\d{2}/)) {
      // If plate looks like a registration number (e.g., AS-01-SC-1392)
      return `Bus-${busNum} (${plate})`;
    } else if (busNum !== null && plate) {
      // Has number and some plate info
      return `Bus-${busNum} (${plate})`;
    } else if (busNum !== null) {
      // Just bus number
      return `Bus-${busNum}`;
    } else if (plate) {
      // Just plate
      return `Bus (${plate})`;
    }
  }

  // Fallback: try to extract from busId string pattern
  const match = busId.match(/bus[_-]?(\d+)/i);
  if (match) {
    console.log('Fallback: extracted from busId pattern:', match[1]);
    return `Bus-${match[1]}`;
  }

  console.log('No match found, returning raw busId');
  return busId; // Last resort: show the raw ID
}

/**
 * Extract bus number from bus ID/number string
 * Handles formats like: "bus_6", "bus-6", "Bus 6", "6", etc.
 */
function extractBusNumber(str: string): number | null {
  if (!str) return null;
  
  // Try to extract number from common patterns
  const patterns = [
    /bus[_-\s]?(\d+)/i,  // bus_6, bus-6, bus 6
    /^(\d+)$/,            // just "6"
    /[_-](\d+)$/          // anything_6
  ];
  
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Normalize bus status to Idle or Enroute
 */
export function normalizeBusStatus(rawStatus: string | null | undefined): {
  label: string;
  variant: 'default' | 'secondary' | 'success';
  tooltip?: string;
} {
  if (!rawStatus) {
    return { label: 'Idle', variant: 'secondary' };
  }

  const status = rawStatus.toLowerCase();

  // Enroute states
  if (['active', 'on_trip', 'enroute', 'moving', 'in_transit'].includes(status)) {
    return { label: 'Enroute', variant: 'success' };
  }

  // Idle states
  if (['idle', 'inactive', 'stopped', 'parked', 'waiting'].includes(status)) {
    return { label: 'Idle', variant: 'secondary' };
  }

  // Unknown status - default to Idle with tooltip
  return {
    label: 'Idle',
    variant: 'secondary',
    tooltip: `Unknown status: ${rawStatus}`
  };
}

/**
 * Normalize route status to Active or Inactive
 */
export function normalizeRouteStatus(rawStatus: string | null | undefined): {
  label: string;
  variant: 'default' | 'secondary';
  tooltip?: string;
} {
  if (!rawStatus) {
    return { label: 'Active', variant: 'default' };
  }

  const status = rawStatus.toLowerCase();

  // Active states
  if (['active', 'enabled', 'operational', 'running'].includes(status)) {
    return { label: 'Active', variant: 'default' };
  }

  // Inactive states
  if (['inactive', 'disabled', 'temporarily_inactive', 'suspended', 'maintenance'].includes(status)) {
    return { label: 'Inactive', variant: 'secondary' };
  }

  // Unknown status - default to Active with tooltip
  return {
    label: 'Active',
    variant: 'default',
    tooltip: `Unknown status: ${rawStatus}`
  };
}

/**
 * Extract first name from full name
 */
export function getFirstName(fullName: string | undefined | null): string {
  if (!fullName) return 'User';
  return fullName.trim().split(' ')[0] || 'User';
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Format date only
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  } catch {
    return dateString;
  }
}


