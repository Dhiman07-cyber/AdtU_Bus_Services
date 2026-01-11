"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";

interface GoogleSignInButtonProps {
  onSignInSuccess?: () => void;
  className?: string;
}

export function GoogleSignInButton({ onSignInSuccess, className }: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { signInWithGoogle, currentUser, userData } = useAuth();

  // Reset loading state when user data is available (redirect is about to happen)
  useEffect(() => {
    if (currentUser && userData && loading) {
      setLoading(false);
    }
  }, [currentUser, userData, loading]);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      
      if (result.success) {
        if (onSignInSuccess) {
          onSignInSuccess();
          setLoading(false);
        } else {
          // Redirect based on user role
          // This will be handled by the auth context useEffect
          // Keep loading state active until redirect happens
        }
      } else {
        // Only reset loading state if sign-in failed
        setLoading(false);
        // Don't log cancelled sign-in as an error
        if (result.error !== 'Sign in was cancelled') {
          console.error("Sign in failed:", result.error);
          // Handle error - could show a toast notification
        } else {
          console.log("User cancelled sign-in");
        }
      }
    } catch (error) {
      // Reset loading state on error
      setLoading(false);
      console.error("Unexpected error during sign in:", error);
    }
  };

  return (
    <Button 
      onClick={handleSignIn}
      className={className}
      disabled={loading}
    >
      <LogIn className="mr-2 h-4 w-4" /> 
      {loading ? "Signing in..." : "Sign in with Google"}
    </Button>
  );
}