/**
 * Device Detection Utility
 * Detects device type for appropriate location strategy
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type Platform = 'android' | 'ios' | 'web';

export interface DeviceInfo {
  type: DeviceType;
  platform: Platform;
  isMobile: boolean;
  isNative: boolean;
  userAgent: string;
}

/**
 * Detect if running in Capacitor native environment
 */
export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 
         !!(window as any).Capacitor;
}

/**
 * Detect if device is mobile based on user agent and screen size
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check Capacitor first
  if (isCapacitor()) return true;
  
  // Check user agent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
  
  // Check screen size
  const isMobileScreen = window.innerWidth <= 768;
  
  // Check touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  return isMobileUA || (isMobileScreen && hasTouch);
}

/**
 * Detect if device is tablet
 */
export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  
  const userAgent = navigator.userAgent.toLowerCase();
  const isTabletUA = userAgent.includes('ipad') || 
                     (userAgent.includes('android') && !userAgent.includes('mobile'));
  
  const isTabletScreen = window.innerWidth > 768 && window.innerWidth <= 1024;
  
  return isTabletUA || isTabletScreen;
}

/**
 * Detect platform (Android, iOS, or Web)
 */
export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  
  // Check Capacitor platform
  if (isCapacitor()) {
    const capacitor = (window as any).Capacitor;
    const platform = capacitor.getPlatform?.();
    if (platform === 'android') return 'android';
    if (platform === 'ios') return 'ios';
  }
  
  // Fallback to user agent
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
    return 'ios';
  }
  
  return 'web';
}

/**
 * Get comprehensive device information
 */
export function getDeviceInfo(): DeviceInfo {
  const platform = getPlatform();
  const isMobile = isMobileDevice();
  const isTabletDevice = isTablet();
  
  let type: DeviceType = 'desktop';
  if (isMobile) type = 'mobile';
  else if (isTabletDevice) type = 'tablet';
  
  return {
    type,
    platform,
    isMobile: type === 'mobile',
    isNative: isCapacitor(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
  };
}

/**
 * Check if device supports background location
 */
export function supportsBackgroundLocation(): boolean {
  const info = getDeviceInfo();
  return info.isNative && (info.platform === 'android' || info.platform === 'ios');
}

/**
 * Check if device supports high accuracy GPS
 */
export function supportsHighAccuracyGPS(): boolean {
  const info = getDeviceInfo();
  // Native apps always support high accuracy
  if (info.isNative) return true;
  
  // Check if browser supports geolocation
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}


