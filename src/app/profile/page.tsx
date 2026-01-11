"use client";

import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function ProfileRedirect() {
  const { userData } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (userData?.role) {
      // Redirect to role-specific profile
      router.replace(`/${userData.role}/profile`);
    }
  }, [userData, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Redirecting to your profile...</p>
      </div>
    </div>
  );
}
