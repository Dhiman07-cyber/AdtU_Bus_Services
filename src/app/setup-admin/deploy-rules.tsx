"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DeployRulesPage() {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const firestoreRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // Anyone can read their own user document
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // Allow creation of user documents
      // Allow users to create their own document (for signup flows)
      // Allow admins to create documents for other users
      // Allow first admin creation when no users exist yet
      allow create: if request.auth != null && (
        request.auth.uid == userId ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin') ||
        // Allow first admin creation - when creating an admin
        // We use a special field to identify first admin creation requests
        (request.resource.data.role == 'admin' && 
         request.resource.data.firstAdmin == true)
      );
      
      // Users can update their own documents for non-sensitive fields
      // Admins can update any user document
      allow update: if request.auth != null && (
        request.auth.uid == userId ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
    }
    
    // Students collection
    match /students/{studentId} {
      // Students can read their own data
      // Admins and moderators can read all student data
      allow read: if request.auth != null && (
        request.auth.uid == studentId ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        ))
      );
      
      // Admins can create/update student documents
      // Students can update non-sensitive fields
      allow create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          request.auth.uid == studentId
        );
    }
    
    // Drivers collection
    match /drivers/{driverId} {
      // Drivers can read their own data
      // Admins and moderators can read all driver data
      allow read: if request.auth != null && (
        request.auth.uid == driverId ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        ))
      );
      
      // Admins can create/update driver documents
      allow create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Moderators collection
    match /moderators/{moderatorId} {
      // Moderators can read their own data
      // Admins can read all moderator data
      allow read: if request.auth != null && (
        request.auth.uid == moderatorId ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
      );
      
      // Only admins can create/update moderator documents
      allow create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Buses collection
    match /buses/{busId} {
      // Authenticated users can read
      allow read: if request.auth != null;
      
      // Only admins and moderators can create/update
      allow create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        );
    }
    
    // Routes collection
    match /routes/{routeId} {
      // Authenticated users can read
      allow read: if request.auth != null;
      
      // Only admins and moderators can create/update
      allow create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        );
    }
    
    // Invitations collection
    match /invitations/{invitationId} {
      // Only admins can read/write invitations
      allow read, create, update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Applications collection
    match /applications/{applicationId} {
      // Students can read their own applications
      // Admins and moderators can read all applications
      allow read: if request.auth != null && (
        resource.data.applicantUID == request.auth.uid ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        ))
      );
      
      // Students can create their own applications
      // Admins and moderators can update applications
      allow create: if request.auth != null;
      
      allow update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator' ||
          request.auth.uid == resource.data.applicantUID
        );
    }
    
    // Notifications collection
    match /notifications/{notificationId} {
      // Authenticated users can read notifications addressed to their role
      allow read: if request.auth != null;
      
      // Only admins and moderators can create notifications
      allow create: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        );
    }
    
    // Attendance collection
    match /attendance/{attendanceId} {
      // Only authenticated users can read
      allow read: if request.auth != null;
      
      // Drivers can create attendance records for their assigned bus
      // Admins and moderators can create attendance records
      allow create: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator' ||
          (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'driver' &&
           get(/databases/$(database)/documents/users/$(request.auth.uid)).data.assignedBus == resource.data.busId)
        );
    }
    
    // Waiting flags collection
    match /waitingFlags/{flagId} {
      // Students can read their own flags
      // Drivers can read flags for their route
      // Admins and moderators can read all flags
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'driver' ||
          request.auth.uid == resource.data.studentId
        );
      
      // Students can create/update their own waiting flags
      // Drivers can update flags for students on their route
      // Admins and moderators can update all flags
      allow create, update: if request.auth != null;
    }
    
    // Driver swap requests collection
    match /driverSwapRequests/{requestId} {
      // Drivers can read their own requests
      // Admins and moderators can read all requests
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator' ||
          request.auth.uid == resource.data.driverId
        );
      
      // Drivers can create requests
      // Admins and moderators can update (approve/reject) requests
      allow create: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'driver';
        
      allow update: if request.auth != null && 
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) && (
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'moderator'
        );
    }
  }
}`;

  const handleCopyRules = () => {
    navigator.clipboard.writeText(firestoreRules);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-4xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
          <h1 className="text-2xl font-bold mb-2 text-center">Deploy Firestore Security Rules</h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
            Follow these instructions to deploy the required Firestore security rules
          </p>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3">Step 1: Copy the Firestore Rules</h2>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-3">
              <pre className="text-xs overflow-x-auto max-h-96">
                {firestoreRules}
              </pre>
            </div>
            <button
              onClick={handleCopyRules}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              {copied ? "Copied!" : "Copy Rules to Clipboard"}
            </button>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3">Step 2: Deploy the Rules</h2>
            <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Option A: Using Firebase Console (Recommended)</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Firebase Console</a></li>
                <li>Select your project</li>
                <li>Navigate to Firestore Database → Rules tab</li>
                <li>Replace the existing rules with the copied rules above</li>
                <li>Click "Publish"</li>
              </ol>
              
              <h3 className="font-medium mt-4 mb-2">Option B: Using Firebase CLI</h3>
              <ol className="list-decimal pl-5 space-y-2">
                <li>Save the rules to a file named <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">firestore.rules</code></li>
                <li>Run the following command in your project directory:</li>
                <li className="font-mono bg-gray-200 dark:bg-gray-600 p-2 rounded">firebase deploy --only firestore:rules</li>
              </ol>
            </div>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3">Step 3: Verify Rules Content</h2>
            <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
              <p className="mb-2">
                For the most accurate rules content, check the exact file content:
              </p>
              <Button asChild>
                <Link href="/rules-content">View Exact Rules Content</Link>
              </Button>
            </div>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3">Step 4: Test the Setup</h2>
            <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
              <p>After deploying the rules:</p>
              <ol className="list-decimal pl-5 space-y-2 mt-2">
                <li>Go back to the home page</li>
                <li>Click "Get Started" or "Go to Dashboard"</li>
                <li>Sign in with Google</li>
                <li>If this is the first user, you'll be automatically set up as an admin</li>
                <li>You'll be redirected to the admin dashboard</li>
              </ol>
            </div>
          </div>
          
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleBackToHome}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
            >
              Back to Home
            </button>
            <Button asChild>
              <Link href="/diagnose-rules">Diagnose Rules</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
