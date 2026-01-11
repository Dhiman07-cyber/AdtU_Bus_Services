"use client";

import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, X, Chrome, Settings } from "lucide-react";

export default function NotificationPermissionBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    // Check notification permission
    if ('Notification' in window) {
      const perm = Notification.permission;
      setPermission(perm);

      // Show banner if denied or default (but not granted)
      const dismissed = localStorage.getItem("notification-banner-dismissed");
      if (perm !== "granted" && !dismissed) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("notification-banner-dismissed", "true");
    setShowBanner(false);
  };

  const handleEnableInstructions = () => {
    // Show more detailed instructions
    alert(`📱 How to Enable Notifications:

Google Chrome:
1. Click the lock/info icon (🔒) in the address bar
2. Find "Notifications" section
3. Change from "Block" to "Allow"
4. Refresh the page

Firefox:
1. Click the lock icon in the address bar
2. Click "Clear This Setting" next to Notifications
3. Refresh and allow when prompted

Edge:
1. Click the lock icon in the address bar
2. Find "Notifications"
3. Select "Allow"
4. Refresh the page

If you don't see notification settings:
• Try using Chrome (best support)
• Check if browser is up to date
• Ensure site is loaded over HTTPS in production`);
  };

  if (!showBanner) return null;

  return (
    <Alert className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-40 max-w-lg mx-auto shadow-lg ${
      permission === 'denied' 
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    }`}>
      <div className="flex items-start gap-3">
        {permission === 'denied' ? (
          <BellOff className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
        ) : (
          <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        )}
        
        <div className="flex-1">
          <AlertDescription className={permission === 'denied' ? 'text-red-800 dark:text-red-200' : 'text-blue-800 dark:text-blue-200'}>
            {permission === 'denied' ? (
              <>
                <strong className="block mb-1">🔕 Notifications Blocked</strong>
                <p className="text-sm mb-2">
                  You've blocked notifications. To receive trip alerts and updates, you need to enable them:
                </p>
                <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded text-xs mb-3 space-y-1">
                  <p className="font-semibold flex items-center gap-2">
                    <Chrome className="h-4 w-4" />
                    Chrome/Edge: Quick Fix
                  </p>
                  <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>Click the <strong>lock icon (🔒)</strong> in the address bar</li>
                    <li>Find <strong>"Notifications"</strong> and change to <strong>"Allow"</strong></li>
                    <li>Refresh this page (F5)</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEnableInstructions}
                    className="text-red-700 hover:text-red-800 border-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Detailed Guide
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                  >
                    Dismiss
                  </Button>
                </div>
              </>
            ) : (
              <>
                <strong className="block mb-1">🔔 Enable Notifications</strong>
                <p className="text-sm mb-2">
                  Get real-time alerts when:
                </p>
                <ul className="list-disc list-inside text-xs space-y-1 mb-3">
                  <li>Your bus trip starts</li>
                  <li>Driver is approaching your stop</li>
                  <li>Important service announcements</li>
                </ul>
                <p className="text-xs mb-2">
                  Click "Allow" when your browser asks for permission.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                >
                  Got it
                </Button>
              </>
            )}
          </AlertDescription>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}


