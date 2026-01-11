"use client";

import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
}

export default function ProtectedRoute({ 
  children, 
  requiredRole 
}: ProtectedRouteProps) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If not logged in, redirect to login
      if (!currentUser) {
        router.push("/login");
        return;
      }
      
      // If role is required and doesn't match, redirect to unauthorized
      if (requiredRole && userData) {
        const userRole = userData.role;
        const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        
        if (!requiredRoles.includes(userRole)) {
          router.push("/unauthorized");
          return;
        }
      }
    }
  }, [currentUser, userData, loading, requiredRole, router]);

  // Show loading state while checking auth
  if (loading || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Check role access
  if (requiredRole && userData) {
    const userRole = userData.role;
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    if (!requiredRoles.includes(userRole)) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground mb-4">
            You don't have permission to access this page.
          </p>
          <button 
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go Home
          </button>
        </div>
      );
    }
  }

  return <>{children}</>;
}