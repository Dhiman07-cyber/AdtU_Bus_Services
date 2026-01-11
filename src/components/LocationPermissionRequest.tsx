"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { geolocationService } from "@/lib/geolocation-service";

interface LocationPermissionRequestProps {
  onPermissionGranted?: () => void;
  onPermissionDenied?: () => void;
}

export default function LocationPermissionRequest({
  onPermissionGranted,
  onPermissionDenied
}: LocationPermissionRequestProps) {
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [isRequesting, setIsRequesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    setPermissionStatus('checking');
    const status = await geolocationService.checkPermissionStatus();
    
    if (status === 'granted') {
      setPermissionStatus('granted');
      onPermissionGranted?.();
    } else if (status === 'denied') {
      setPermissionStatus('denied');
      onPermissionDenied?.();
    } else {
      setPermissionStatus('prompt');
    }
  };

  const requestPermission = async () => {
    setIsRequesting(true);
    setErrorMessage('');

    try {
      const granted = await geolocationService.requestPermission();
      
      if (granted) {
        setPermissionStatus('granted');
        onPermissionGranted?.();
      } else {
        setPermissionStatus('denied');
        setErrorMessage('Location permission was denied. Please enable it in your browser settings.');
        onPermissionDenied?.();
      }
    } catch (error: any) {
      setPermissionStatus('denied');
      setErrorMessage(error.message || 'Failed to request location permission');
      onPermissionDenied?.();
    } finally {
      setIsRequesting(false);
    }
  };

  if (permissionStatus === 'checking') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Checking location permissions...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (permissionStatus === 'granted') {
    return (
      <Alert className="w-full max-w-md mx-auto bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          Location access granted. You're all set!
        </AlertDescription>
      </Alert>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <Card className="w-full max-w-md mx-auto border-red-200 dark:border-red-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <CardTitle className="text-red-900 dark:text-red-200">Location Access Denied</CardTitle>
          </div>
          <CardDescription className="text-red-700 dark:text-red-300">
            {errorMessage || 'Location permission is required to use this feature'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200 text-sm">
              <strong>To enable location access:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Click the lock icon in your browser's address bar</li>
                <li>Find "Location" or "Geolocation" settings</li>
                <li>Change permission to "Allow"</li>
                <li>Refresh this page</li>
              </ol>
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
            variant="outline"
          >
            Refresh Page
          </Button>
        </CardContent>
      </Card>
    );
  }

  // prompt state
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle>Location Permission Required</CardTitle>
        </div>
        <CardDescription>
          We need access to your location to track the bus in real-time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
            <strong>Why we need this:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Share your bus location with students</li>
              <li>Provide accurate arrival time estimates</li>
              <li>Track your route progress</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button 
          onClick={requestPermission} 
          disabled={isRequesting}
          className="w-full"
        >
          {isRequesting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Requesting Permission...
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 mr-2" />
              Enable Location Access
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Your location is only shared while the trip is active
        </p>
      </CardContent>
    </Card>
  );
}



