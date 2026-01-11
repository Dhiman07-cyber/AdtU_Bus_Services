"use client";

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import FacultyDepartmentSelector from '@/components/faculty-department-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signalCollectionRefresh } from '@/hooks/useEventDrivenRefresh';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/contexts/toast-context';
import { Info, Camera, PenSquare, Trash2, Loader2 } from "lucide-react";
import { getAllRoutes, getAllBuses, getModeratorById } from '@/lib/dataService';
import { Route } from '@/lib/types';
import EnhancedDatePicker from "@/components/enhanced-date-picker";
import { calculateValidUntilDate, getAcademicYearDeadline } from '@/lib/utils/date-utils';
import { checkBusCapacity, type BusCapacityInfo, type CapacityCheckResult } from '@/lib/bus-capacity-checker';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ProfileImageAddModal from '@/components/ProfileImageAddModal';
import Image from 'next/image';
import RouteSelectionSection from '@/components/RouteSelectionSection';

import ApplyFormNavbar from '@/components/ApplyFormNavbar';
import { uploadImage } from '@/lib/upload';

// Define the form data type
type StudentFormData = {
  name: string;
  email: string;
  phone: string;
  alternatePhone: string;
  enrollmentId: string;
  gender: string;
  dob: string; // Add date of birth field
  age: string; // Keep age field but it will be auto-calculated
  faculty: string;
  department: string;
  semester: string;
  parentName: string;
  parentPhone: string;
  busAssigned: string;
  busId?: string;
  routeId: string;
  profilePhoto: File | null;
  address: string;
  bloodGroup: string;
  shift: string;
  approvedBy: string;
  // Bus Session System Fields
  sessionDuration: string; // 1, 2, 3, 4 years or custom
  sessionStartYear: number;
  sessionEndYear: number;
  validUntil: string;
  pickupPoint: string; // Stop ID from route
};

export default function AddStudentForm() {
  const { currentUser, userData, loading } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  // Always initialize with empty form data - no auto-fill
  // Always initialize with empty form data - no auto-fill
  const getInitialFormData = (): StudentFormData => {
    return {
      name: '',
      email: '',
      phone: '',
      alternatePhone: '',
      enrollmentId: '',
      gender: '',
      dob: '',
      age: '',
      faculty: '',
      department: '',
      semester: '',
      parentName: '',
      parentPhone: '',
      busAssigned: '',
      busId: '',
      routeId: '',
      profilePhoto: null,
      address: '',
      bloodGroup: '',
      shift: '',
      approvedBy: '',
      sessionDuration: '1',
      sessionStartYear: new Date().getFullYear(),
      sessionEndYear: new Date().getFullYear() + 1,
      validUntil: '',
      pickupPoint: '',
    };
  };

  const [formData, setFormData] = useState<StudentFormData>(getInitialFormData());

  // Consolidate initialization and restore logic
  // Consolidate initialization and restore logic
  useEffect(() => {
    // 1. Calculate dynamic defaults
    const currentYear = new Date().getFullYear();
    const defaultSessionStart = currentYear;
    const defaultSessionEnd = currentYear + 1;
    // Use consistent utility for default date
    const defaultValidUntil = calculateValidUntilDate(defaultSessionStart, 1).toISOString();

    // 2. Prepare base data with defaults
    let initialData = {
      ...getInitialFormData(),
      sessionStartYear: defaultSessionStart,
      sessionEndYear: defaultSessionEnd,
      validUntil: defaultValidUntil,
      sessionDuration: '1'
    };

    // 3. Attempt to restore from localStorage
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem('adminStudentFormData');
      console.log('🔍 [Admin] Checking localStorage for draft...', savedData ? 'Found' : 'Not found');

      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          // Aggressively merge saved data with current defaults
          initialData = {
            ...initialData,
            ...parsedData,
            profilePhoto: null, // Never restore file objects
          };

          // RECALCULATION: If validUntil is missing, or if sessionStartYear is outdated (older than current year), update it
          if (!initialData.validUntil || initialData.validUntil === 'N/A' || (initialData.sessionStartYear < currentYear)) {
            // Force current year if stored year is old
            if (initialData.sessionStartYear < currentYear) {
              initialData.sessionStartYear = currentYear;
            }

            const startYear = typeof initialData.sessionStartYear === 'string' ? parseInt(initialData.sessionStartYear) : initialData.sessionStartYear || defaultSessionStart;
            const duration = parseInt(initialData.sessionDuration) || 1;

            initialData.validUntil = calculateValidUntilDate(startYear, duration).toISOString();
            initialData.sessionEndYear = startYear + duration;
            console.log('🔄 [Admin] Recalculated/Updated session details:', { start: initialData.sessionStartYear, validUntil: initialData.validUntil });
          }
        } catch (e) {
          console.error('❌ [Admin] Error parsing saved form data:', e);
        }
      }
    }

    // 4. Update state once
    setFormData(initialData);
  }, []); // Run once on mount

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showImageModal, setShowImageModal] = useState(false);
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [capacityCheckResult, setCapacityCheckResult] = useState<CapacityCheckResult | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for routes and buses
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadingBuses, setLoadingBuses] = useState(true);
  const [facultySelected, setFacultySelected] = useState(false);

  // 5. Enable auto-save ONLY after data dependencies (routes/buses) are loaded
  useEffect(() => {
    if (!loadingRoutes && !loadingBuses) {
      // Add a small delay after data load to ensure child components (Selectors) have hydrated and stabilized
      const timer = setTimeout(() => {
        setIsLoaded(true);
        console.log('🚀 [Admin] Auto-save ENABLED');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loadingRoutes, loadingBuses]);



  // Auto-fill approvedBy field with current admin's details
  useEffect(() => {
    const fetchApproverDetails = async () => {
      if (userData && userData.name) {
        let idSuffix = 'ADMIN';

        if (userData.role === 'moderator') {
          idSuffix = 'MOD'; // Default

          const localId = (userData as any).employeeId || (userData as any).empId || (userData as any).staffId;

          if (localId && localId !== 'undefined') {
            idSuffix = localId;
          } else if (currentUser?.uid) {
            try {
              const modData = await getModeratorById(currentUser.uid);
              if (modData) {
                idSuffix = (modData as any).employeeId || (modData as any).empId || (modData as any).staffId || 'MOD';
              }
            } catch (err) {
              console.error('Error fetching moderator ID:', err);
            }
          }
        } else if (userData.role === 'admin') {
          idSuffix = 'Admin';
        }

        setFormData(prev => ({
          ...prev,
          approvedBy: idSuffix === 'Admin' ? `${userData.name} (Admin)` : `${userData.name} ( ${idSuffix} )`
        }));
      }
    };
    fetchApproverDetails();
  }, [userData, currentUser]);

  // Save form data to localStorage whenever it changes (except sensitive fields)
  useEffect(() => {
    if (typeof window !== 'undefined' && isLoaded) {
      // Create a copy without sensitive data
      const { profilePhoto, ...dataToSave } = formData;

      // Safety check: Don't save if critical fields are suddenly empty (might be a component resetting state)
      // If name is present (as seen in screenshot), we assume the form is mostly valid.
      // But we can check if gender/semester are becoming empty after being non-empty.
      // For now, let's just log and save.
      console.log('💾 [Admin] Saving draft to localStorage:', dataToSave);
      localStorage.setItem('adminStudentFormData', JSON.stringify(dataToSave));
    }
  }, [formData, isLoaded]);

  // Fetch routes and buses when component mounts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [routesData, busesData] = await Promise.all([
          getAllRoutes(),
          getAllBuses()
        ]);
        setRoutes(routesData);
        setBuses(busesData);
      } catch (error) {
        console.error('Error fetching routes/buses:', error);
        addToast('Failed to load routes and buses', 'error');
      } finally {
        setLoadingRoutes(false);
        setLoadingBuses(false);
      }
    };

    fetchData();
  }, [addToast]);



  // Handle capacity check results and toast notifications
  useEffect(() => {
    if (!capacityCheckResult) return;

    const { isFull, hasAlternatives, alternativeBuses, isNearCapacity, selectedBus } = capacityCheckResult;

    // 1. Handle Full Bus Scenario
    if (isFull) {
      if (hasAlternatives && alternativeBuses.length > 0) {
        if (alternativeBuses.length === 1) {
          // Alternative available - Auto-select handled by RouteSelectionSection usually, 
          // but we reinforce here or handle specific messaging if needed.
          // The RouteSelectionSection component handles the detailed toast for this.
        } else {
          // Multiple alternatives
          // The RouteSelectionSection component handles warning toast
        }
      } else {
        // No alternatives - Critical
        // let user know about review process
      }
    }

    // 2. Handle Near Capacity (but not full)
    else if (isNearCapacity && selectedBus) {
      // User can proceed but warn them
      // Toast handled by RouteSelectionSection or we can add custom one here
      // addToast(`⚠️ Bus is near capacity (>95%).`, 'warning');
    }

    // 3. Available - Silence is golden (no toast needed)

  }, [capacityCheckResult, addToast]);

  const handleFacultySelect = (faculty: string) => {
    setFormData(prev => ({ ...prev, faculty }));
    setFacultySelected(true);
  };

  const handleDepartmentSelect = (department: string) => {
    setFormData(prev => ({ ...prev, department }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let { name, value } = e.target;

    // Numeric-only restriction for phone number fields
    if (name === 'phone' || name === 'alternatePhone' || name === 'parentPhone') {
      value = value.replace(/[^0-9]/g, '');
    }

    console.log(`✍️ [Admin] Input change: ${name} =`, value);
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Calculate session end year and validUntil date using deadline-config.json
  const calculateSessionEnd = (startYear: number, durationYears: number) => {
    // Ensure valid numbers
    const validStartYear = isNaN(startYear) ? new Date().getFullYear() : startYear;
    const validDuration = isNaN(durationYears) ? 1 : durationYears;

    const endYear = validStartYear + validDuration;
    // Calculate validUntil using config (June 30th by default)
    const validUntil = calculateValidUntilDate(validStartYear, validDuration).toISOString();
    return { endYear, validUntil };
  };

  // Handle session duration change
  const handleSessionDurationChange = (duration: string) => {
    const durationNum = parseInt(duration) || 1;
    const { endYear, validUntil } = calculateSessionEnd(formData.sessionStartYear, durationNum);

    setFormData(prev => ({
      ...prev,
      sessionDuration: duration,
      sessionEndYear: endYear,
      validUntil: validUntil
    }));
  };

  // Handle session start year change
  const handleSessionStartYearChange = (year: number | string) => {
    const yearNum = typeof year === 'string' ? parseInt(year) : year;
    const validYear = isNaN(yearNum) ? new Date().getFullYear() : yearNum;
    const durationNum = parseInt(formData.sessionDuration) || 1;
    const { endYear, validUntil } = calculateSessionEnd(validYear, durationNum);

    setFormData(prev => ({
      ...prev,
      sessionStartYear: validYear,
      sessionEndYear: endYear,
      validUntil: validUntil
    }));
  };

  const handleRefChange = (field: string, value: any) => {
    // Determine the field name to update based on component output
    // The component sends 'routeId', 'busId', 'stopId', 'busAssigned'
    console.log(`🔄 [Admin] Ref change: ${field} =`, value);

    // Map 'stopId' to 'pickupPoint' as per form data structure
    if (field === 'stopId') {
      setFormData(prev => ({ ...prev, pickupPoint: value }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleDateChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // Calculate age when date of birth changes
    if (name === 'dob' && value) {
      const birthDate = new Date(value);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      // Adjust age if birthday hasn't occurred yet this year
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      setFormData(prev => ({ ...prev, age: age.toString() }));
    }

    // Clear error when user makes a selection
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleImageConfirm = (file: File) => {
    // This is now handled by the modal returning a URL
    // But we keep this for consistency if needed or remove it
  };

  const handleProfileImageAdd = (url: string, file?: File) => {
    setFinalImageUrl(url);
    if (file) {
      setFormData(prev => ({ ...prev, profilePhoto: file }));
    }
    setPreviewUrl(url);
    setShowImageModal(false);
  };

  const handleImageRemove = () => {
    setPreviewUrl(null);
    setFinalImageUrl(null);
    setFormData(prev => ({ ...prev, profilePhoto: null }));
  };

  // Format route display text - Show first, fourth, second-last, and last stops
  const formatRouteDisplay = (route: Route) => {
    if (!route.stops || route.stops.length === 0) return `${route.routeName} (No stops)`;
    if (route.stops.length <= 4) {
      return `${route.routeName} → ${route.stops.map((stop: any) => stop.name || stop).join(', ')}`;
    }

    // Get first, fourth, second-last, and last stops
    const first = route.stops[0];
    const fourth = route.stops[3];
    const secondLast = route.stops[route.stops.length - 2];
    const last = route.stops[route.stops.length - 1];

    return `${route.routeName} → ${first.name || first}, ${fourth.name || fourth}, ${secondLast.name || secondLast}, ${last.name || last}`;
  };

  // Get selected route for display
  const selectedRoute = routes.find(route => route.routeId === formData.routeId);

  // Validation function
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Name validation - no special symbols except spaces
    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (/[^a-zA-Z\s]/.test(formData.name)) {
      newErrors.name = "Name cannot contain special symbols";
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone validation - minimum 10 digits, only numbers
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!/^\d{10,}$/.test(formData.phone)) {
      newErrors.phone = "Phone number must be at least 10 digits";
    }

    // Alternate phone validation - if provided, only numbers and minimum 10 digits
    if (formData.alternatePhone && !/^\d{10,}$/.test(formData.alternatePhone)) {
      newErrors.alternatePhone = "Alternate phone number must be at least 10 digits";
    }

    // Age validation - only positive numbers (auto-calculated, so just check if it's valid)
    if (!formData.age) {
      newErrors.age = "Age is required";
    } else if (!/^\d+$/.test(formData.age) || parseInt(formData.age) <= 0) {
      newErrors.age = "Age must be a positive number";
    }

    // Gender validation
    if (!formData.gender) {
      newErrors.gender = "Gender is required";
    }

    // Faculty validation
    if (!formData.faculty) {
      newErrors.faculty = "Faculty is required";
    } else if (/[^a-zA-Z\s&()-]/.test(formData.faculty)) {
      newErrors.faculty = "Faculty cannot contain special symbols except spaces, &, (, )";
    }

    // Department validation
    if (!formData.department) {
      newErrors.department = "Department is required";
    }

    // Semester validation
    if (!formData.semester) {
      newErrors.semester = "Semester is required";
    }

    // Parent name validation - no special symbols except spaces
    if (!formData.parentName.trim()) {
      newErrors.parentName = "Parent name is required";
    } else if (/[^a-zA-Z\s]/.test(formData.parentName)) {
      newErrors.parentName = "Parent name cannot contain special symbols";
    }

    // Parent phone validation - minimum 10 digits, only numbers
    if (!formData.parentPhone.trim()) {
      newErrors.parentPhone = "Parent phone number is required";
    } else if (!/^\d{10,}$/.test(formData.parentPhone)) {
      newErrors.parentPhone = "Parent phone number must be at least 10 digits";
    }

    // Enrollment ID validation
    if (!formData.enrollmentId.trim()) {
      newErrors.enrollmentId = "Enrollment ID is required";
    }

    // Date of Birth validation
    if (!formData.dob) {
      newErrors.dob = "Date of birth is required";
    }

    // Shift validation
    if (!formData.shift) {
      newErrors.shift = "Shift is required";
    }

    // Session validation
    if (!formData.sessionDuration) {
      newErrors.sessionDuration = "Session duration is required";
    }

    // Route validation
    if (!formData.routeId) {
      newErrors.routeId = "Route is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      setIsSubmitting(true);
      try {
        console.log('Form data being submitted:', formData);

        // Get route details
        const selectedRoute = routes.find(route => route.routeId === formData.routeId);
        console.log('Selected route:', selectedRoute);

        // Upload profile photo if it exists as a file
        let profilePhotoUrl = finalImageUrl || '';
        if (formData.profilePhoto) {
          try {
            const uploadedUrl = await uploadImage(formData.profilePhoto);
            if (uploadedUrl) {
              profilePhotoUrl = uploadedUrl;
            }
          } catch (err) {
            console.error('Failed to upload profile photo', err);
            addToast('Failed to upload profile photo', 'error');
            // Proceed without photo or return? 
            // Ideally return, but let's try to proceed or handle nicely.
            // User requested proper storage. Assuming critical failure if not stored.
            setIsSubmitting(false);
            return;
          }
        }

        // Get Firebase ID token for authentication
        const idToken = await currentUser?.getIdToken();

        // Auto-derive busId from routeId (pattern: route_X → bus_X)
        const busId = formData.routeId ? formData.routeId.replace('route_', 'bus_') : null;
        console.log('Auto-derived busId from routeId:', { routeId: formData.routeId, busId });

        const response = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + idToken
          },
          body: JSON.stringify({
            email: formData.email,
            name: formData.name,
            role: 'student',
            phone: formData.phone,
            alternatePhone: formData.alternatePhone,
            profilePhotoUrl: profilePhotoUrl,
            enrollmentId: formData.enrollmentId,
            gender: formData.gender,
            age: parseInt(formData.age) || 0, // Ensure number
            faculty: formData.faculty,
            department: formData.department,
            semester: formData.semester,
            parentName: formData.parentName,
            parentPhone: formData.parentPhone,
            dob: formData.dob,
            routeId: formData.routeId,
            busId: busId, // Auto-derived from routeId
            address: formData.address,
            bloodGroup: formData.bloodGroup,
            shift: formData.shift,
            approvedBy: formData.approvedBy,
            // Session fields
            durationYears: parseInt(formData.sessionDuration), // Renamed from sessionDuration
            sessionStartYear: formData.sessionStartYear,
            sessionEndYear: formData.sessionEndYear,
            validUntil: formData.validUntil,
            stopId: formData.pickupPoint // Renamed from pickupPoint
          }),
        });

        console.log('Create user response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Create user error:', errorData);
          throw new Error(errorData.error || 'Failed to create user');
        }

        const result = await response.json();

        // 1. Reset form data to initial state to prevent useEffect from re-saving draft
        setFormData(getInitialFormData());

        // 2. Clear saved form data on successful submission
        if (typeof window !== 'undefined') {
          localStorage.removeItem('adminStudentFormData');
        }

        addToast(result.message || 'Student created successfully!', 'success');

        // Signal the students list page to refresh when it's rendered
        signalCollectionRefresh('students');

        // Redirect to students list after successful creation
        setTimeout(() => {
          router.push('/admin/students');
        }, 1500);
      } catch (error) {
        setIsSubmitting(false);
        console.error('Error adding student:', error);
        addToast(error instanceof Error ? error.message : 'Failed to add student. Please try again.', 'error');
      }
    } else {
      addToast('Please fix the errors in the form', 'error');
    }
  };

  const handleReset = () => {
    const employeeId = (userData as any)?.employeeId || 'ADMIN';
    const approvedByValue = userData?.name ? `${userData.name} (${employeeId})` : '';

    setFormData({
      name: '',
      email: '',
      phone: '',
      alternatePhone: '',
      enrollmentId: '',
      gender: '',
      dob: '',
      age: '',
      faculty: '',
      department: '',
      semester: '',
      parentName: '',
      parentPhone: '',
      busAssigned: '',
      routeId: '',
      profilePhoto: null,
      address: '',
      bloodGroup: '',
      shift: '',
      approvedBy: approvedByValue,
      // Reset session fields
      sessionDuration: '1',
      sessionStartYear: new Date().getFullYear(),
      sessionEndYear: new Date().getFullYear() + 1,
      validUntil: '',
      pickupPoint: '',
    });
    setPreviewUrl(null);
    setErrors({});
    setFacultySelected(false);

    // Clear saved form data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminStudentFormData');
    }

    addToast('Form reset successfully', 'info');
  };

  return (
    <div className="mt-10 py-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Add Student</h1>
            <p className="text-gray-400 text-xs text-left">Register a new student in the system</p>
          </div>
          <Link
            href="/admin/students"
            className="inline-flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 hover:border-white/30 rounded-lg transition-all duration-200 hover:shadow-lg backdrop-blur-sm"
          >
            <span className="mr-1.5 text-sm">←</span>
            Back
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-[#0E0F12] to-[#1A1B23] backdrop-blur-sm rounded-2xl shadow-2xl border border-white/10 p-4 sm:p-10 hover:border-white/20 transition-all duration-300">
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Profile Photo Section - Moved to top center */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative group cursor-pointer" onClick={() => setShowImageModal(true)}>
                  {finalImageUrl ? (
                    <div className="relative h-24 w-24 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-xl ring-2 ring-blue-100 dark:ring-blue-900">
                      <Image
                        src={finalImageUrl}
                        alt="Profile"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-xl ring-2 ring-slate-100 dark:ring-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
                      <Camera className="h-8 w-8 text-slate-400 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}

                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                    <Camera className="h-6 w-6 text-white drop-shadow-md transform scale-90 group-hover:scale-100 transition-transform" />
                  </div>

                  {finalImageUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageRemove();
                      }}
                      className="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors z-10"
                      title="Remove photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <p className="mt-3 text-sm text-gray-500 font-medium">Click to upload photo</p>

                <ProfileImageAddModal
                  isOpen={showImageModal}
                  onClose={() => setShowImageModal(false)}
                  onConfirm={handleProfileImageAdd}
                  immediateUpload={false}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Full Name
                    </Label>
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="h-9"
                    />
                    {errors.name && <p className="text-red-500 text-[10px]">{errors.name}</p>}
                  </div>

                  <div>
                    <Label htmlFor="gender" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gender
                    </Label>
                    <Select
                      key={formData.gender}
                      value={formData.gender}
                      onValueChange={(value) => handleRefChange('gender', value)}
                    >
                      <SelectTrigger className="h-9 bg-blue-600/10 border-blue-500/20 text-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.gender && <p className="text-red-500 text-[10px]">{errors.gender}</p>}
                  </div>

                  <div className="flex justify-center">
                    <div className="w-full max-w-7xl relative">
                      <EnhancedDatePicker
                        id="dob"
                        label="Date of Birth"
                        value={formData.dob}
                        onChange={(value) => handleDateChange('dob', value)}
                        required
                        validationType="dob-student"
                        className="h-9"
                      />
                      {errors.dob && <p className="text-red-500 text-[10px]">{errors.dob}</p>}
                    </div>

                    <div className="flex-1">
                      <Label htmlFor="age" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Age
                      </Label>
                      <Input
                        type="number"
                        id="age"
                        name="age"
                        value={formData.age}
                        readOnly
                        className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                      />
                      {errors.age && <p className="text-red-500 text-[10px]">{errors.age}</p>}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phone" className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Phone Number
                    </Label>
                    <Input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                      className="h-9"
                    />
                    {errors.phone && <p className="text-red-500 text-[10px]">{errors.phone}</p>}
                  </div>

                  <div>
                    <Label htmlFor="email" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email Address
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      className="h-9"
                    />
                    {errors.email && <p className="text-red-500 text-[10px]">{errors.email}</p>}
                  </div>

                  <div>
                    <Label htmlFor="alternatePhone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Alternate Phone Number
                    </Label>
                    <Input
                      type="tel"
                      id="alternatePhone"
                      name="alternatePhone"
                      value={formData.alternatePhone}
                      onChange={handleInputChange}
                      className="h-9"
                    />
                    {errors.alternatePhone && <p className="text-red-500 text-[10px]">{errors.alternatePhone}</p>}
                  </div>

                  <div>
                    <Label htmlFor="address" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Address
                    </Label>
                    <Textarea
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="resize-none text-xs min-h-[110px]"
                    />
                    {errors.address && <p className="text-red-500 text-[10px]">{errors.address}</p>}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-3 pt-[1px]">
                  <div className="space-y-1">
                    {/* Faculty and Department Selector */}
                    <FacultyDepartmentSelector
                      onFacultySelect={handleFacultySelect}
                      onDepartmentSelect={handleDepartmentSelect}
                      initialFaculty={formData.faculty}
                      initialDepartment={formData.department}
                    />
                    {errors.faculty && <p className="text-red-500 text-[10px]">{errors.faculty}</p>}
                    {errors.department && <p className="text-red-500 text-[10px]">{errors.department}</p>}
                  </div>

                  <div>
                    <Label htmlFor="semester" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mt-3 mb-1">
                      Semester
                    </Label>
                    <Select
                      key={formData.semester}
                      value={formData.semester}
                      onValueChange={(value) => handleRefChange('semester', value)}
                    >
                      <SelectTrigger className="h-9 bg-blue-600/10 border-blue-500/20 text-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Select Semester" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => {
                          const label = sem === 1 ? '1st Semester' : sem === 2 ? '2nd Semester' : sem === 3 ? '3rd Semester' : `${sem}th Semester`;
                          return (
                            <SelectItem key={sem} value={label}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {errors.semester && <p className="text-red-500 text-[10px]">{errors.semester}</p>}
                  </div>



                  <div>
                    <Label htmlFor="enrollmentId" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Enrollment ID
                    </Label>
                    <Input
                      type="text"
                      id="enrollmentId"
                      name="enrollmentId"
                      value={formData.enrollmentId}
                      onChange={handleInputChange}
                      required
                      className="h-9"
                    />
                    {errors.enrollmentId && <p className="text-red-500 text-[10px]">{errors.enrollmentId}</p>}
                  </div>

                  <div>
                    <Label htmlFor="bloodGroup" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Blood Group
                    </Label>
                    <Select
                      key={formData.bloodGroup}
                      value={formData.bloodGroup}
                      onValueChange={(value) => handleRefChange('bloodGroup', value)}
                    >
                      <SelectTrigger className="h-9 bg-blue-600/10 border-blue-500/20 text-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Select Blood Group" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.bloodGroup && <p className="text-red-500 text-[10px]">{errors.bloodGroup}</p>}
                  </div>

                  <div>
                    <Label htmlFor="parentName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Parent Name
                    </Label>
                    <Input
                      type="text"
                      id="parentName"
                      name="parentName"
                      value={formData.parentName}
                      onChange={handleInputChange}
                      required
                      className="h-9"
                    />
                    {errors.parentName && <p className="text-red-500 text-[10px]">{errors.parentName}</p>}
                  </div>

                  <div>
                    <Label htmlFor="parentPhone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Parent Phone Number
                    </Label>
                    <Input
                      type="tel"
                      id="parentPhone"
                      name="parentPhone"
                      value={formData.parentPhone}
                      onChange={handleInputChange}
                      required
                      className="h-9"
                    />
                    {errors.parentPhone && <p className="text-red-500 text-[10px]">{errors.parentPhone}</p>}
                  </div>

                  <div>
                    <Label htmlFor="approvedBy" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Approved By
                    </Label>
                    <Input
                      type="text"
                      id="approvedBy"
                      name="approvedBy"
                      value={formData.approvedBy}
                      readOnly
                      className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed h-9"
                      disabled
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">This field is auto-filled</p>
                  </div>
                </div>
              </div>

              {/* BUS SERVICE SESSION DETAILS */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white border-b pb-1">
                  Bus Service Session Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-3">
                  {/* Row 1: Shift and Session Duration */}
                  <div>
                    <Label htmlFor="shift" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Shift <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      key={formData.shift}
                      value={formData.shift}
                      onValueChange={(value) => {
                        handleRefChange('shift', value);
                        // Clear route/bus/stop selection when shift changes
                        handleRefChange('routeId', '');
                        handleRefChange('busId', '');
                        handleRefChange('stopId', '');
                        handleRefChange('busAssigned', '');
                      }}
                    >
                      <SelectTrigger className="bg-blue-600/10 border-blue-500/20 text-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Select Shift" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        <SelectItem value="Morning">Morning Shift</SelectItem>
                        <SelectItem value="Evening">Evening Shift</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.shift && <p className="text-red-500 text-[10px] mt-0.5">{errors.shift}</p>}
                  </div>

                  <div>
                    <Label htmlFor="sessionDuration" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Session Duration <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      key={formData.sessionDuration}
                      value={formData.sessionDuration}
                      onValueChange={handleSessionDurationChange}
                    >
                      <SelectTrigger className="bg-blue-600/10 border-blue-500/20 text-gray-900 dark:text-gray-100">
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" align="start">
                        <SelectItem value="1">1 Year</SelectItem>
                        <SelectItem value="2">2 Years</SelectItem>
                        <SelectItem value="3">3 Years</SelectItem>
                        <SelectItem value="4">4 Years</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Most students choose 1 year
                    </p>
                  </div>

                  {/* Route, Bus, and Stop Selection - Requires shift to be selected first */}
                  <div className="col-span-1 md:col-span-2">
                    <RouteSelectionSection
                      routes={routes}
                      buses={buses}
                      selectedRouteId={formData.routeId || ''}
                      selectedBusId={formData.busId || ''}
                      selectedStopId={formData.pickupPoint || ''}
                      selectedShift={formData.shift}
                      onReferenceChange={handleRefChange}
                      onCapacityCheckResult={setCapacityCheckResult}
                      isReadOnly={!formData.shift}
                    />
                    {!formData.shift && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Please select a shift first to enable route selection
                      </p>
                    )}
                  </div>

                  {/* Row 2: Session Start Year and Session End Year */}
                  <div>
                    <Label htmlFor="sessionStartYear" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Session Start Year <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      id="sessionStartYear"
                      name="sessionStartYear"
                      value={formData.sessionStartYear}
                      onChange={(e) => handleSessionStartYearChange(parseInt(e.target.value))}
                      min={2020}
                      max={2040}
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Year when service begins
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="sessionEndYear" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Session End Year
                    </Label>
                    <Input
                      type="number"
                      id="sessionEndYear"
                      value={formData.sessionEndYear}
                      readOnly
                      className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed"
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Auto-calculated based on duration
                    </p>
                  </div>

                  {/* Row 3: Valid Until */}
                  <div>
                    <Label htmlFor="validUntil" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Valid Until
                    </Label>
                    <Input
                      type="text"
                      id="validUntil"
                      value={formData.validUntil ? new Date(formData.validUntil).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                      readOnly
                      className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-xs"
                    />
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Service expires on {formData.validUntil ? new Date(formData.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'June 30'}, {formData.sessionEndYear}
                    </p>
                  </div>


                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-2 w-full">
                <Button
                  type="button"
                  onClick={handleReset}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-full text-xs"
                >
                  Reset
                </Button>
                <Link href="/admin/students" className="w-full block">
                  <Button type="button" className="bg-red-600 hover:bg-red-700 text-white w-full text-xs">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700 text-white w-full text-xs flex items-center justify-center gap-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Student'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
