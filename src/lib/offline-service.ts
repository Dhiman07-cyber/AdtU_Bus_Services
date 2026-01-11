// Function to get bus routes from Firestore (fallback to empty array)
export const getOfflineBusRoutes = (): any[] => {
  console.warn('Offline bus routes not available - using empty array');
  return [];
};

// Function to get faculties and departments (fallback to empty array)
export const getOfflineFaculties = (): any[] => {
  console.warn('Offline faculties not available - using empty array');
  return [];
};

// Function to get notifications (fallback to empty array)
export const getOfflineNotifications = (): any[] => {
  console.warn('Offline notifications not available - using empty array');
  return [];
};

// Function to get a specific route by ID (fallback to null)
export const getOfflineRouteById = (routeId: string): any | null => {
  console.warn('Offline route by ID not available - returning null');
  return null;
};

// Function to get a specific route by bus number (fallback to null)
export const getOfflineRouteByBusNumber = (busNumber: string): any | null => {
  console.warn('Offline route by bus number not available - returning null');
  return null;
};