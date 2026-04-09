"use client";
import FormStepper from './components/FormStepper';
import Step1Personal from './steps/Step1Personal';
import Step2Academic from './steps/Step2Academic';
import Step3Bus from './steps/Step3Bus';
import Step4ServicePayment from './steps/Step4ServicePayment';
import Step5Review from './steps/Step5Review';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Save,
  Send,
  CheckCircle,
  AlertCircle,
  X,
  Shield,
  FileText,
  Info,
  RotateCcw,
  Camera,
  ArrowRight
} from 'lucide-react';
import { trackEvent } from '@/components/Analytics';
import ProfileImageAddModal from '@/components/ProfileImageAddModal';
import { ApplicationFormData, ApplicationState, ModeratorProfile } from '@/lib/types/application';
import Image from 'next/image';
import FacultyDepartmentSelector from '@/components/faculty-department-selector';
import EnhancedDatePicker from '@/components/enhanced-date-picker';
import { getAllRoutes, getAllBuses } from '@/lib/dataService';
import { Route } from '@/lib/types';
import RouteSelectionSection from '@/components/RouteSelectionSection';
import ApplyFormNavbar from '@/components/ApplyFormNavbar';
import PaymentModeSelector from '@/components/PaymentModeSelector';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  calculateSessionDates,
  hasCompletedPayment,
  getCurrentPaymentSession,
  clearPaymentSession,
  updatePaymentSessionStatus,
  savePaymentSession
} from '@/lib/payment/application-payment.service';
import {
  type CapacityCheckResult
} from '@/lib/bus-capacity-checker';
import { useToast } from '@/contexts/toast-context';
import { uploadImage } from '@/lib/upload';
import { PremiumPageLoader } from '@/components/LoadingSpinner';
import { isMobileDevice, compressImageForMobile } from '@/lib/mobile-utils';
import { useDebouncedStorage } from '@/hooks/useDebouncedStorage';
import { OptimizedInput } from '@/components/forms/OptimizedInput';
import { OptimizedSelect } from '@/components/forms/OptimizedSelect';
import { SelectItem } from '@/components/ui/select';

const STEP_LABELS = [
  { num: 1, title: "Personal Information" },
  { num: 2, title: "Academic Information" },
  { num: 3, title: "Bus Information" },
  { num: 4, title: "Payment Information" },
  { num: 5, title: "Review Information" }
];

function ApplicationFormContent() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const TOTAL_STEPS = 5;

  const goToNextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      localStorage.setItem('applicationDraft', JSON.stringify(formData));
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= TOTAL_STEPS) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Helper function to get initial form data from localStorage
  const getInitialFormData = (): ApplicationFormData => {
    const defaultData: ApplicationFormData = {
      fullName: '',
      email: currentUser?.email || '',
      phoneNumber: '',
      alternatePhone: '',
      enrollmentId: '',
      gender: '',
      dob: '',
      age: '',
      profilePhotoUrl: '',
      faculty: '',
      department: '',
      semester: '',
      address: '',
      parentName: '',
      parentPhone: '',
      bloodGroup: '',
      routeId: '',
      stopId: '',
      busId: '',
      busAssigned: '',
      assignedBusId: '',
      shift: '',
      sessionInfo: {
        sessionStartYear: new Date().getFullYear(),
        durationYears: 1,
        sessionEndYear: new Date().getFullYear() + 1,
        feeEstimate: 0
      },
      paymentInfo: {
        paymentMode: 'offline',
        amountPaid: 0,
        paymentEvidenceProvided: false,
        paymentReference: '',
        paymentEvidenceUrl: ''
      },
      declarationAccepted: false
    };

    // Try to load from localStorage synchronously
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('applicationDraft');
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log('ðŸ“¬ [Apply Form] Loaded draft from localStorage on init', Object.keys(parsed).length, 'fields');
          return {
            ...defaultData,
            ...parsed,
            // Always reset sensitive/transient fields
            declarationAccepted: false,
            // Preserve email from currentUser
            email: currentUser?.email || parsed.email || '',
            // Reset session info to current year
            sessionInfo: {
              ...defaultData.sessionInfo,
              ...(parsed.sessionInfo || {}),
              durationYears: 1,
              sessionStartYear: new Date().getFullYear(),
              sessionEndYear: new Date().getFullYear() + 1
            }
          };
        }
      } catch (error) {
        console.error('❌ [Apply Form] Error loading draft from localStorage:', error);
      }
    }

    return defaultData;
  };

  const getInitialApplicationState = () => {
    if (typeof window !== 'undefined') {
      try {
        const storedState = localStorage.getItem('applicationState');
        return (storedState as ApplicationState) || 'noDoc';
      } catch (error) {
        console.error('❌ [Apply Form] Error loading application state:', error);
      }
    }
    return 'noDoc' as ApplicationState;
  };

  // Form state - Initialize with data from localStorage
  const [formData, setFormData] = useState<ApplicationFormData>(getInitialFormData);

  // Profile photo state
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string>('');

  const [applicationId, setApplicationId] = useState<string>('');

  // Initialize application state from localStorage
  const [applicationState, setApplicationState] = useState<ApplicationState>(getInitialApplicationState());

  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [facultySelected, setFacultySelected] = useState(false);
  const [declarationAgreed, setDeclarationAgreed] = useState(false);
  const [busFees, setBusFees] = useState(0);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [assignedBusInfo, setAssignedBusInfo] = useState<any>(null);
  const [deadlineConfig, setDeadlineConfig] = useState<any>(null);

  // Fetch deadline config
  useEffect(() => {
    const fetchDeadlineConfig = async () => {
      try {
        const response = await fetch('/api/settings/deadline-config');
        if (response.ok) {
          const data = await response.json();
          setDeadlineConfig(data.config || data);
          console.log("ðŸ“… [Apply Form] Fetched deadline config:", data.config || data);
        }
      } catch (error) {
        console.error("Error fetching deadline config:", error);
      }
    };
    fetchDeadlineConfig();
  }, []);

  // UI state
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingResources, setLoadingResources] = useState(true);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [useOnlinePayment, setUseOnlinePayment] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [showProfileUpdateModal, setShowProfileUpdateModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const toastShownRef = useRef(false);

  // Debounced auto-save to prevent excessive localStorage writes
  const debouncedAutoSave = useRef<NodeJS.Timeout | null>(null);

  // Import debounced storage hook
  const storage = useDebouncedStorage<ApplicationFormData>('applicationDraft', {
    debounceMs: 500,
    excludeFields: ['profilePhotoUrl', 'paymentInfo.paymentEvidenceUrl'],
  });

  // Auto-save formData changes (debounced) - ONLY save, don't read
  const lastSavedData = useRef<string>('');

  useEffect(() => {
    if (debouncedAutoSave.current) {
      clearTimeout(debouncedAutoSave.current);
    }

    debouncedAutoSave.current = setTimeout(() => {
      const dataString = JSON.stringify(formData);
      // Only save if data actually changed
      if (dataString !== lastSavedData.current) {
        console.log('ðŸ’¾ [Apply Form] Auto-saving to localStorage...', {
          fullName: formData.fullName,
          phoneNumber: formData.phoneNumber,
          gender: formData.gender
        });
        storage.save(formData);
        lastSavedData.current = dataString;
      }
    }, 500);

    return () => {
      if (debouncedAutoSave.current) {
        clearTimeout(debouncedAutoSave.current);
      }
    };
  }, [formData]); // Removed storage from deps - it's stable

  // Mobile detection
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Verification state ( and verificationExpiry already initialized above from localStorage)
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdownTime, setCountdownTime] = useState(0);
  const [codesSentToday, setCodesSentToday] = useState(0);
  const [maxCodesReached, setMaxCodesReached] = useState(false);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persistence for application state and verification state
  useEffect(() => {
    if (applicationState !== 'noDoc' && applicationState !== 'submitted') {
      localStorage.setItem('applicationState', applicationState);
    }
  }, [applicationState]);



  // Bus capacity check state
  const [capacityCheckResult, setCapacityCheckResult] = useState<CapacityCheckResult | null>(null);
  const [checkingCapacity, setCheckingCapacity] = useState(false);
  const [showCapacityWarning, setShowCapacityWarning] = useState(false);





  // Cleanup function - CRITICAL for mobile
  useEffect(() => {
    return () => {
      if (debouncedAutoSave.current) {
        clearTimeout(debouncedAutoSave.current);
        debouncedAutoSave.current = null;
      }
    };
  }, []);

  // Step validation logic
  const isStepComplete = useCallback((stepNum: number) => {
    switch (stepNum) {
      case 1:
        return !!(formData.fullName && formData.gender && formData.dob &&
          formData.phoneNumber && formData.parentName && formData.parentPhone &&
          formData.address && (finalImageUrl || profilePhotoUrl));
      case 2:
        return !!(formData.faculty && formData.department && formData.semester && formData.enrollmentId);
      case 3:
        return !!(formData.routeId && formData.stopId && formData.shift);
      case 4:
        return paymentCompleted;
      default:
        return false;
    }
  }, [formData, finalImageUrl, profilePhotoUrl, paymentCompleted]);

  const [visitedSteps, setVisitedSteps] = useState<number[]>([1]);

  useEffect(() => {
    if (!visitedSteps.includes(currentStep)) {
      setVisitedSteps(prev => [...prev, currentStep]);
    }
  }, [currentStep, visitedSteps]);


  useEffect(() => {
    console.log('ðŸ“‹ Application Form - Auth State:', {
      loading,
      currentUser: !!currentUser,
      userData: !!userData,
      userRole: userData?.role
    });

    if (!loading && !currentUser) {
      console.log('ðŸ”„ No user, redirecting to login');
      router.push('/login');
      return;
    }

    if (userData && userData.role) {
      console.log('ðŸ”„ User has role, redirecting to dashboard');
      router.push(`/${userData.role}`);
      return;
    }

    // Check if user has already submitted an application
    const checkExistingApplication = async () => {
      try {
        const response = await fetch('/api/applications/check', {
          headers: {
            'Authorization': `Bearer ${await currentUser?.getIdToken()}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // If application exists and is not rejected/draft (so submitted, approved, verified), show status card
          // User request: "until that student's application is not rejected OR as long as his firestore doc remains"
          if (data.hasApplication && data.application?.state !== 'rejected' && data.application?.state !== 'draft' && data.application?.state !== 'noDoc') {
            console.log('âœ… User has existing application in state:', data.application?.state);

            // Show toast only once
            if (!toastShownRef.current) {
              showToast("Application already submitted. Waiting for approval.", "info");
              toastShownRef.current = true;
            }

            setIsSubmitted(true);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking existing application:', error);
      }

      if (currentUser) {
        console.log('âœ… Loading application form resources');
        loadResources();
        loadDraftOrExisting();
      }
    };

    if (currentUser && !userData?.role) {
      checkExistingApplication();
    }
  }, [loading, currentUser, userData, router, applicationId]); // Added applicationId back to keep dependency array size constant



  const loadResources = async () => {
    try {
      const token = await currentUser?.getIdToken();

      // Load routes and buses
      const [routesData, busesData, modsRes] = await Promise.all([
        getAllRoutes(),
        getAllBuses(),
        fetch('/api/moderators/get-all', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      console.log('ðŸ›£ï¸ Loaded routes:', routesData);
      setRoutes(routesData);
      setBuses(busesData);


    } catch (error) {
      console.error('Error loading resources:', error);
      showToast('Failed to load form resources', 'error');
    } finally {
      setLoadingResources(false);
    }
  };

  const loadDraftOrExisting = async () => {
    try {
      // Note: Draft data is now loaded synchronously during initialization
      // This function only handles loading existing applications from database

      console.log('ðŸ“‹ Checking for existing application in database...');

      // Check for existing application in database
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/my-application', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.application) {
          console.log('ðŸ“‹ Loading existing application from database');
          setApplicationId(data.application.applicationId);
          setApplicationState(data.application.state);

          // Only update formData if there's an actual application (not just draft)
          if (data.application.state !== 'noDoc' && data.application.state !== 'draft') {
            setFormData(data.application.formData);
            setReceiptPreview(data.application.formData.paymentInfo.paymentEvidenceUrl || '');
            setReceiptFile(null);
            setProfilePhotoUrl(data.application.formData.profilePhotoUrl || '');



            if (data.application.state === 'verified' || data.application.state === 'submitted') {
              showToast('Application already submitted. Waiting for approval.', 'info');
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading application:', error);
    }
  };

  // Optimized input change handler - immediate update, no batching
  const handleInputChange = useCallback((field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev };
      const keys = field.split('.');
      let current: any = updated;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      return updated;
    });
  }, []);

  const handleFacultySelect = useCallback((faculty: string) => {
    setFormData(prev => ({ ...prev, faculty }));
    setFacultySelected(true);
  }, []);

  const handleDepartmentSelect = useCallback((department: string) => {
    setFormData(prev => ({ ...prev, department }));
  }, []);

  const handleProfileImageUpdate = async (newImageUrl: string, file?: File) => {
    // Update local preview and form data
    setProfilePhotoUrl(newImageUrl);
    setFinalImageUrl(newImageUrl);

    if (file) {
      setProfilePhotoFile(file);
    } else {
      setProfilePhotoFile(null);
    }

    // We update the form data with the blob URL for now, but will replace it on submit if file exists
    setFormData(prev => ({ ...prev, profilePhotoUrl: newImageUrl }));
  };

  const handleImageRemove = () => {
    // Clean up the object URL to prevent memory leaks
    if (profilePhotoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(profilePhotoUrl);
    }
    setProfilePhotoUrl('');
    setFinalImageUrl(null);
    setProfilePhotoFile(null);
    setImagePosition({ x: 0, y: 0, scale: 1 });
    setFormData(prev => ({ ...prev, profilePhotoUrl: '' }));
  };

  const handleRefChange = useCallback((field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev };
      const keys = field.split('.');
      let current: any = updated;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      return updated;
    });
  }, []);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', 'error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error');
      return;
    }

    // Clean up previous object URL if it exists
    if (receiptPreview && receiptPreview.startsWith('blob:')) {
      URL.revokeObjectURL(receiptPreview);
    }

    try {
      // Mobile optimization: Compress image if on mobile device
      let processedFile = file;
      if (isMobileDevice() && file.size > 1 * 1024 * 1024) { // 1MB threshold for mobile
        console.log('ðŸ“± Mobile device detected, compressing image...');
        showToast('Optimizing image for mobile...', 'info');
        processedFile = await compressImageForMobile(file, 2);
        console.log(`ðŸ“± Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB â†’ ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
      }

      // Create local preview URL
      const previewUrl = URL.createObjectURL(processedFile);

      // Store file and preview
      setReceiptFile(processedFile);
      setReceiptPreview(previewUrl);
      setFormData(prev => ({
        ...prev,
        paymentInfo: { ...prev.paymentInfo, paymentEvidenceProvided: true }
      }));

      showToast('Receipt selected successfully', 'success');
    } catch (error) {
      console.error('Error processing receipt:', error);
      showToast('Error processing image. Please try again.', 'error');
    }
  };

  const handleSessionDurationChange = (duration: string) => {
    const durationNum = 1;
    const startYear = formData.sessionInfo.sessionStartYear;
    const endYear = startYear + durationNum;

    setFormData(prev => ({
      ...prev,
      sessionInfo: {
        ...prev.sessionInfo,
        durationYears: durationNum,
        sessionEndYear: endYear,
        feeEstimate: calculateTotalFee(durationNum, prev.shift)
      }
    }));

    // Also update the amount to be paid
    const newFee = calculateTotalFee(durationNum, formData.shift);
    setFormData(prev => ({
      ...prev,
      paymentInfo: { ...prev.paymentInfo, amountPaid: newFee }
    }));
  };

  // Load bus fees from Firestore
  useEffect(() => {
    const loadBusFees = async () => {
      try {
        const response = await fetch(`/api/settings/bus-fees?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          const fee = data.fees || data.amount || 0;
          console.log('ðŸ’° Loaded bus fee from API:', fee);
          setBusFees(fee);
        }
      } catch (error) {
        console.error('Error loading bus fees:', error);
      }
    };
    if (currentUser) {
      loadBusFees();
    }
  }, [currentUser]);

  const calculateTotalFee = (duration?: number, shift?: string) => {
    const dur = duration || formData.sessionInfo.durationYears;
    if (dur === 0) return 0; // No fee if no duration selected
    const shiftMultiplier = 1; // All shifts have the same fee now
    return busFees * dur * shiftMultiplier;
  };

  // Optimized fee sync effect with memoization to prevent excessive re-renders
  const previousFeeRef = useRef({ estimate: 0, paid: 0 });

  useEffect(() => {
    // Always calculate fee when busFees is available and durationYears is set (including 1)
    if (busFees > 0 && formData.sessionInfo.durationYears > 0) {
      const newFee = calculateTotalFee(formData.sessionInfo.durationYears, formData.shift);

      // Only update if changed to avoid loops and excessive re-renders
      if (newFee !== previousFeeRef.current.estimate || newFee !== previousFeeRef.current.paid) {
        console.log(`ðŸ’° Syncing fee: ${newFee} (was Est: ${previousFeeRef.current.estimate}, Paid: ${previousFeeRef.current.paid})`);

        previousFeeRef.current = { estimate: newFee, paid: newFee };

        setFormData(prev => ({
          ...prev,
          sessionInfo: {
            ...prev.sessionInfo,
            feeEstimate: newFee
          },
          paymentInfo: {
            ...prev.paymentInfo,
            amountPaid: newFee
          }
        }));
      }
    }
  }, [busFees, formData.sessionInfo.durationYears, formData.shift]);


  const validateForm = useCallback(() => {
    // Personal Information validation
    if (!formData.fullName || !formData.phoneNumber || !formData.enrollmentId) {
      showToast('Please fill all required personal details', 'error');
      return false;
    }
    if (!formData.gender || !formData.dob || !formData.age) {
      showToast('Please fill all personal information fields', 'error');
      return false;
    }

    // Academic Information validation
    if (!formData.faculty || !formData.department || !formData.semester) {
      showToast('Please fill all academic information', 'error');
      return false;
    }

    // Contact Information validation
    if (!formData.address || !formData.parentName || !formData.parentPhone) {
      showToast('Please fill all contact information', 'error');
      return false;
    }

    // Medical Information validation
    if (!formData.bloodGroup) {
      showToast('Please select blood group', 'error');
      return false;
    }

    // Service Selection validation
    if (!formData.shift) {
      showToast('Please select a shift', 'error');
      return false;
    }
    if (!formData.routeId) {
      showToast('Please select a route', 'error');
      return false;
    }
    if (!formData.busId || !formData.busAssigned) {
      showToast('Please select a bus', 'error');
      return false;
    }
    if (!formData.stopId) {
      showToast('Please select a pickup point / stop', 'error');
      return false;
    }

    // Session Duration validation
    if (!formData.sessionInfo.durationYears || formData.sessionInfo.durationYears === 0) {
      showToast('Please select session duration', 'error');
      return false;
    }

    // Profile Photo validation
    // Robust check: Check nested formData, standalone state, AND the raw file object
    const hasPhoto = formData.profilePhotoUrl || profilePhotoUrl || profilePhotoFile;
    if (!hasPhoto) {
      showToast('Please upload a profile photo', 'error');
      return false;
    }

    return true;
  }, [formData, profilePhotoUrl, profilePhotoFile, showToast]);

  const checkFormCompletion = useCallback(() => {
    // Personal Information
    if (!formData.fullName || !formData.phoneNumber || !formData.enrollmentId) return false;
    if (!formData.gender || !formData.dob || !formData.age) return false;

    // Academic Information
    if (!formData.faculty || !formData.department || !formData.semester) return false;

    // Contact Information
    if (!formData.address || !formData.parentName || !formData.parentPhone) return false;

    // Medical Information
    if (!formData.bloodGroup) return false;

    // Service Selection
    if (!formData.shift) return false;
    if (!formData.routeId) return false;

    // Session Duration
    if (!formData.sessionInfo.durationYears || formData.sessionInfo.durationYears === 0) return false;

    // Profile Photo
    if (!formData.profilePhotoUrl) return false;

    return true;
  }, [formData]);

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const hasData = formData.fullName || formData.phoneNumber || formData.enrollmentId || formData.faculty;
      if (hasData) {
        showToast('âœ… Draft auto-saved successfully!', 'success');
      } else {
        showToast('ðŸ“  No data to save yet.', 'info');
      }
    } catch (error) {
      console.error('Error in save draft animation:', error);
      showToast('Draft save animation failed', 'error');
    } finally {
      setSaving(false);
    }
  };


const [showDeletePaymentDialog, setShowDeletePaymentDialog] = useState(false);

const performFullReset = () => {
  // Clear form data
  setFormData({
    fullName: '',
    email: currentUser?.email || '',
    phoneNumber: '',
    alternatePhone: '',
    enrollmentId: '',
    gender: '',
    dob: '',
    age: '',
    profilePhotoUrl: '',
    faculty: '',
    department: '',
    semester: '',
    address: '',
    parentName: '',
    parentPhone: '',
    bloodGroup: '',
    routeId: '',
    stopId: '',
    busId: '',
    busAssigned: '',
    assignedBusId: '',
    shift: 'morning',
    sessionInfo: {
      sessionStartYear: new Date().getFullYear(),
      durationYears: 1,
      sessionEndYear: new Date().getFullYear() + 1,
      feeEstimate: 0
    },
    paymentInfo: {
      paymentMode: 'offline',
      amountPaid: 0,
      paymentEvidenceProvided: false,
      paymentEvidenceUrl: '',
      paymentReference: ''
    },
    declarationAccepted: false
  });

  // Clear all related state
  setPreviewUrl('');
  setFinalImageUrl(null);
  setImagePosition({ x: 0, y: 0, scale: 1 });
  setProfilePhotoFile(null);
  setProfilePhotoUrl('');
  setApplicationId('');
  setFacultySelected(false);
  setDeclarationAgreed(false);
  setPaymentCompleted(false);
  setPaymentDetails(null);
  setUseOnlinePayment(false);
  setReceiptPreview('');
  setReceiptFile(null);

  localStorage.removeItem('applicationDraft');
  localStorage.removeItem('receiptPreview');
  localStorage.removeItem('profilePhotoPreview');

  // CRITICAL FIX: Never delete payment sessions on form reset
  // localStorage.removeItem('paymentSessions');
  // localStorage.removeItem('currentPaymentSession');

  if (currentUser?.uid) {
    localStorage.removeItem(`payment_receipt_${currentUser.uid}_new_registration`);
  }

  showToast('Form reset successfully', 'success');
  setShowDeletePaymentDialog(false);
};

const handleResetForm = () => {
  // Check if online payment is active/completed
  const isOnlinePaymentActive = paymentCompleted && formData.paymentInfo?.paymentMode === 'online';

  if (isOnlinePaymentActive) {
    // If payment exists, execute Partial Reset (preserve payment) regardless of dirty state
    const currentPaymentInfo = { ...formData.paymentInfo };

    setFormData({
      fullName: '',
      email: currentUser?.email || '',
      phoneNumber: '',
      alternatePhone: '',
      enrollmentId: '',
      gender: '',
      dob: '',
      age: '',
      profilePhotoUrl: '',
      faculty: '',
      department: '',
      semester: '',
      address: '',
      parentName: '',
      parentPhone: '',
      bloodGroup: '',
      routeId: '',
      stopId: '',
      busId: '',
      busAssigned: '',
      assignedBusId: '',
      shift: '',
      sessionInfo: {
        sessionStartYear: new Date().getFullYear(),
        durationYears: 0,
        sessionEndYear: new Date().getFullYear(),
        feeEstimate: 0
      },
      paymentInfo: currentPaymentInfo, // Key: Preserve this!
      declarationAccepted: false
    });

    // Reset most state, but KEEP payment state
    setPreviewUrl('');
    setFinalImageUrl(null);
    setImagePosition({ x: 0, y: 0, scale: 1 });
    setProfilePhotoFile(null);
    setProfilePhotoUrl('');

    // Force state to 'draft' so user can edit the form again
    setApplicationState('draft');

    setFacultySelected(false);
    setDeclarationAgreed(false);

    setReceiptPreview('');
    setReceiptFile(null);

    // Clear localStorage BUT preserve payment keys
    localStorage.removeItem('applicationDraft');
    localStorage.removeItem('');
    localStorage.removeItem('verificationExpiry');
    localStorage.removeItem('');

    // Do NOT remove paymentSessions, currentPaymentSession, etc.

    showToast('Form reset successful.', 'info');
  } else {
    // Case 3: No online payment -> Full Reset
    performFullReset();
  }
};

const handleSubmitApplication = async () => {
  console.log('ðŸš€ Starting application submission...');
  console.log('ðŸ“‹ Current state:', {
    applicationState,
    hasReceiptFile: !!receiptFile,
    receiptFileName: receiptFile?.name,
    hasReceiptUrl: !!formData.paymentInfo?.paymentEvidenceUrl,
    receiptUrl: formData.paymentInfo?.paymentEvidenceUrl,
    hasProfilePhotoFile: !!profilePhotoFile,
    profilePhotoFileName: profilePhotoFile?.name,
    hasProfilePhotoUrl: !!formData.profilePhotoUrl,
    paymentMode: formData.paymentInfo?.paymentMode
  });

  if (applicationState !== 'verified') {
    showToast('Please complete verification first', 'error');
    return;
  }

  if (!formData.declarationAccepted) {
    showToast('Please accept the declaration first', 'error');
    return;
  }

  // CRITICAL: Re-validate form data before final submission
  // Even if verified (via online payment), we must ensure all fields are filled
  if (!validateForm()) {
    return;
  }

  setSubmitting(true);
  try {
    // First, handle profile photo upload if we have a file waiting
    // Uses priority: 1. Raw file (new upload), 2. Nested state, 3. Standalone state
    let finalProfilePhotoUrl = formData.profilePhotoUrl || profilePhotoUrl;

    if (profilePhotoFile) {
      // Show uploading toast - REMOVED per user request
      // const uploadToast = showToast('Uploading profile photo...', 'info');

      try {
        const uploadedUrl = await uploadImage(profilePhotoFile);
        if (uploadedUrl) {
          finalProfilePhotoUrl = uploadedUrl;
          console.log('âœ… Profile photo uploaded successfully:', finalProfilePhotoUrl);
        } else {
          throw new Error('Upload returned empty URL');
        }
      } catch (uploadError) {
        console.error('Failed to upload profile photo:', uploadError);
        showToast('Failed to upload profile photo. Please try again.', 'error');
        setSubmitting(false);
        return;
      }
    }

    // Safety check: Ensure we never submit a blob URL
    if (finalProfilePhotoUrl && finalProfilePhotoUrl.startsWith('blob:')) {
      console.error('â Œ Attempted to submit blob URL for profile photo');
      showToast('Profile photo upload invalid. Please re-select your photo.', 'error');
      setSubmitting(false);
      return;
    }

    const applicationData = {
      ...formData,
      profilePhotoUrl: finalProfilePhotoUrl, // Use the uploaded URL, not the blob
      age: formData.age.toString(), // Ensure age is string
      paymentInfo: {
        ...formData.paymentInfo,
        // Ensure payment status matches mode
        paymentStatus: formData.paymentInfo.paymentMode === 'online' ? 'completed' : 'pending'
      }
    };
    console.log('ðŸš€ Starting application submission process...');

    // Force token refresh to ensure authentication is valid (handles case where phone screen was off)
    let token;
    try {
      console.log('ðŸ”„ Refreshing auth token...');
      token = await currentUser?.getIdToken(true);
    } catch (authError) {
      console.error('â Œ Failed to refresh auth token:', authError);
      // Fallback to existing token if refresh fails
      token = await currentUser?.getIdToken();
    }

    if (!token) {
      console.error('â Œ Failed to get auth token');
      throw new Error('Authentication session expired. Please refresh the page and sign in again.');
    }
    console.log('âœ… Auth token retrieved successfully');

    // Upload receipt file if there's one (using same /api/upload as profile photo)
    let receiptUrl = formData.paymentInfo.paymentEvidenceUrl || '';
    let receiptProvided = formData.paymentInfo.paymentEvidenceProvided;

    if (receiptFile) {
      console.log('ðŸ“¤ Uploading receipt during form submission...');

      // Mobile optimization: Check file size and compress if needed
      if (receiptFile.size > 2 * 1024 * 1024) { // 2MB threshold for mobile
        console.log('âš ï¸  Large file detected on mobile, this might cause issues');
        showToast('Large file detected. Upload may take longer on mobile.', 'info');
      }

      const formDataUpload = new FormData();
      formDataUpload.append('file', receiptFile);

      // Mobile-specific retry logic
      let uploadSuccess = false;
      let lastError: Error | null = null;
      const maxRetries = isMobileDevice() ? 2 : 1; // More retries on mobile

      for (let attempt = 1; attempt <= maxRetries && !uploadSuccess; attempt++) {
        try {
          console.log(`ðŸ“¤ Upload attempt ${attempt}/${maxRetries}`);

          if (attempt > 1) {
            showToast(`Retrying upload (${attempt}/${maxRetries})...`, 'info');
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }

          // Mobile-specific timeout and retry logic
          const uploadResponse = await Promise.race([
            fetch('/api/upload', {
              method: 'POST',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              body: formDataUpload
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Upload timeout')), 30000) // 30 second timeout
            )
          ]) as Response;

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            receiptUrl = uploadData.url;
            receiptProvided = true; // Mark as provided when receipt is uploaded
            console.log('âœ… Receipt uploaded successfully:', receiptUrl);
            uploadSuccess = true;
          } else {
            const errorText = await uploadResponse.text();
            console.error(`â Œ Receipt upload failed (attempt ${attempt}):`, errorText);
            lastError = new Error(`Upload failed with status ${uploadResponse.status}: ${errorText}`);
          }
        } catch (uploadError: any) {
          console.error(`â Œ Receipt upload error (attempt ${attempt}):`, uploadError);
          lastError = uploadError;

          if (uploadError.message === 'Upload timeout') {
            lastError = new Error('Upload timed out. Please try with a smaller image or better network connection.');
          } else if (uploadError.name === 'TypeError' && uploadError.message.includes('fetch')) {
            lastError = new Error('Network error during upload. Please check your internet connection and try again.');
          }
        }
      }

      if (!uploadSuccess && lastError) {
        throw lastError;
      }
    }

    // Submit application with verification code ID
    console.log('ðŸ“¤ Sending final application data to /api/applications/submit-final...');
    const response = await fetch('/api/applications/submit-final', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        formData: {
          ...formData,
          profilePhotoUrl: finalProfilePhotoUrl,
          paymentInfo: {
            ...formData.paymentInfo,
            paymentEvidenceUrl: receiptUrl,
            paymentEvidenceProvided: receiptProvided
          }
        },
        needsCapacityReview: capacityCheckResult?.needsCapacityReview || false
      })
    });

    console.log('ðŸ“¥ Response received from submit-final:', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (response.ok) {
      const data = await response.json();
      console.log('âœ… Application submission confirmed by server');

      trackEvent('student_added');
      showToast('Application submitted successfully! Waiting for approval from the Managing Team.', 'success');

      // Clean up all localStorage data related to the application
      const cleanupKeys = [
        'applicationDraft', 'applicationState',
        'receiptPreview', 'profilePhotoPreview',
        'lastFormStep', 'form_start_time'
      ];

      cleanupKeys.forEach(key => localStorage.removeItem(key));

      // Use service to safely clear current user's payment data
      if (currentUser?.uid) {
        clearPaymentSession(currentUser.uid, 'new_registration');
        localStorage.removeItem(`payment_receipt_${currentUser.uid}_new_registration`);
      }

      // Deep cleanup of dynamic keys (excluding shared payment sessions)
      // Correctly collect keys FIRST before removing to avoid indexing issues
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        // Skip important cross-user data
        if (key === 'paymentSessions') continue;

        // Target application, form, draft, and payment related keys
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('application') ||
          lowerKey.includes('form') ||
          lowerKey.includes('draft') ||
          lowerKey.includes('payment')) {

          // Final safety check for shared storage
          if (key !== 'paymentSessions') {
            keysToRemove.push(key);
          }
        }
      }

      // Final execution of key removal
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`Cleared ${keysToRemove.length} application-related localStorage keys.`);

      // Clean up the object URLs if they were local previews
      if (formData.profilePhotoUrl && formData.profilePhotoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(formData.profilePhotoUrl);
      }
      if (receiptPreview && receiptPreview.startsWith('blob:')) {
        URL.revokeObjectURL(receiptPreview);
      }

      // Redirect to welcome/info page
      router.push('/apply');
    } else {
      let errorData;
      try {
        const text = await response.text();
        try {
          errorData = JSON.parse(text);
        } catch (e) {
          console.error('â Œ Failed to parse error response as JSON:', text);
          errorData = { message: `Server error (${response.status}): ${text.substring(0, 100)}...` };
        }
      } catch (readError) {
        errorData = { message: `Critical server error (${response.status})` };
      }
      throw new Error(errorData.message || errorData.error || 'Failed to submit application');
    }
  } catch (error: any) {
    console.error('â Œ CRITICAL: Error submitting application:', error);
    console.error('Diagnostic Info:', {
      name: error.name,
      message: error.message,
      isTypeError: error instanceof TypeError,
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      stack: error.stack
    });

    // Provide user-friendly error messages
    let errorMessage = 'Failed to submit application';

    if (error.message.includes('Cloudinary')) {
      errorMessage = 'Failed to upload payment receipt. Please check your internet connection and try again.';
    } else if (error.message.includes('profile photo')) {
      errorMessage = 'Failed to upload profile photo. Please try again or choose a different image.';
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    } else if (error.message.includes('verification')) {
      errorMessage = error.message; // Use the specific verification error message
    } else {
      errorMessage = error.message || 'Failed to submit application. Please try again.';
    }

    showToast(errorMessage, 'error');
  } finally {
    setSubmitting(false);
  }
};

useEffect(() => {
  console.log('ðŸ”  CHECKING VERIFICATION STATE ON LOAD...');

  // Check for completed payment (both online and offline) and verification state
  if (currentUser) {
    console.log('ðŸ‘¤ Current user found, checking verification state...');

    // Log all relevant localStorage keys
    const verificationCompleted = localStorage.getItem('verificationCompleted');
    const savedApplicationState = localStorage.getItem('applicationState');
    const backupVerificationState = localStorage.getItem('backup_verification_state');
    const verificationCompletedAt = localStorage.getItem('verificationCompletedAt');

    console.log('ðŸ“‹ localStorage verification data:', {
      verificationCompleted,
      savedApplicationState,
      backupVerificationState,
      verificationCompletedAt,
      allKeys: Object.keys(localStorage).filter(key =>
        key.includes('verification') || key.includes('application')
      )
    });

    // First check if verification was completed (most reliable)
    if (verificationCompleted === 'true' && savedApplicationState === 'verified') {
      console.log('âœ… RESTORING VERIFICATION STATE from localStorage flags');
      setApplicationState('verified');
      setPaymentCompleted(true);
      return;
    }

    // Check backup verification state
    if (backupVerificationState) {
      try {
        const backupData = JSON.parse(backupVerificationState);
        if (backupData.verified && backupData.userId === currentUser.uid) {
          console.log('âœ… RESTORING VERIFICATION STATE from backup data');
          setApplicationState('verified');
          setPaymentCompleted(true);
          // Restore primary flags if missing
          localStorage.setItem('verificationCompleted', 'true');
          localStorage.setItem('applicationState', 'verified');
          return;
        }
      } catch (e) {
        console.warn('âš ï¸  Failed to parse backup verification state:', e);
      }
    }

    // Fallback to payment session check
    console.log('ðŸ”„ Checking payment session as fallback...');
    const completedPayment = hasCompletedPayment(currentUser.uid, 'new_registration');
    if (completedPayment) {
      console.log('ðŸ’³ Found completed payment, checking session...');
      setPaymentCompleted(true);
      const session = getCurrentPaymentSession();
      if (session) {
        console.log('ðŸ“¦ Payment session found:', session);
        // Handle online payment
        if (session.paymentMode === 'online' && session.razorpayPaymentId) {
          setPaymentDetails({
            paymentId: session.razorpayPaymentId,
            orderId: session.razorpayOrderId,
            amount: session.amount
          });
          setUseOnlinePayment(true);
          setApplicationState('verified');
          console.log('âœ… Restored online payment verification from localStorage');
        }
        // Handle offline payment
        else if (session.paymentMode === 'offline' && session.offlinePaymentId) {
          setUseOnlinePayment(false);
          setApplicationState('verified');
          console.log('âœ… Restored offline payment verification from localStorage');
        }
      } else {
        console.log('âš ï¸  No payment session found despite completed payment flag');
      }
    } else {
      console.log('â„¹ï¸  No completed payment found');
    }
  } else {
    console.log('âš ï¸  No current user found');
  }

  console.log('ðŸ”  VERIFICATION STATE CHECK COMPLETED');
}, [currentUser]);

if (loading || (currentUser && loadingResources)) {
  return <PremiumPageLoader fullScreen message="Initializing Application Form..." subMessage="Loading resources and verification status..." />;
}

if (isSubmitted) {
  return (
    <div className="min-h-screen bg-[#05060e] py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse delay-1000" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="bg-[#0c0e1a]/80 backdrop-blur-xl border border-slate-800/50 rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-hidden">
          <div className="p-8 sm:p-12 md:p-16">
            <div className="flex flex-col items-center">
              {/* Success Icon */}
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-emerald-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
                <div className="relative h-24 w-24 sm:h-28 sm:w-28 bg-gradient-to-br from-emerald-400 to-green-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/20 rotate-3 transition-transform hover:rotate-6 duration-500">
                  <CheckCircle className="h-12 w-12 sm:h-14 sm:w-14 text-white drop-shadow-lg" />
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/30 py-1 px-3 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-300">Success</span>
                </div>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-slate-400 text-center tracking-tight mb-4 drop-shadow-sm">
                Application Received
              </h1>

              <p className="text-lg text-slate-400 text-center max-w-md font-light leading-relaxed">
                Your application has been securely submitted to the <span className="text-indigo-300 font-medium">AdtU Bus Services</span> portal.
              </p>
            </div>

            {/* Progress Timeline */}
            <div className="mb-10 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm mt-10">
              <div className="flex items-center justify-between relative">
                {/* Connecting Line */}
                <div className="absolute top-1/3 left-4 right-4 h-0.5 bg-slate-700/50 -translate-y-1/2 z-0"></div>
                <div className="absolute top-1/3 left-4 right-1/2 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 -translate-y-1/2 z-0"></div>

                {/* Step 1 */}
                <div className="relative z-10 flex flex-col items-start gap-2 sm:gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-900/80 border-2 border-indigo-500 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(99,102,241,0.4)]">
                    <CheckCircle className="w-4 h-4 text-indigo-200" />
                  </div>
                  <span className="text-[9px] sm:text-xs font-semibold text-indigo-200 tracking-wide uppercase">Submitted</span>
                </div>

                {/* Step 2 */}
                <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]">
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-[9px] sm:text-xs font-semibold text-blue-200 tracking-wide uppercase text-center">Under Review</span>
                </div>

                {/* Step 3 */}
                <div className="relative z-10 flex flex-col items-end gap-2 sm:gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                  </div>
                  <span className="text-[9px] sm:text-xs font-semibold text-slate-500 tracking-wide uppercase">Approved</span>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 mb-8 flex gap-4 items-start">
              <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                <Info className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-indigo-200 mb-1">What happens next?</h4>
                <p className="text-sm text-indigo-200/70 leading-relaxed">
                  Our administrative team will review your application details. This process typically takes 24-48 hours. Once verified, you will receive full access to your student dashboard.
                </p>
              </div>
            </div>

            {/* Footer / ID */}
            <div className="flex flex-col items-center justify-center border-t border-slate-700/50 pt-8">
              <div className="flex items-center gap-3 text-sm text-slate-500 font-medium bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/30">
                <span className="flex h-2 w-2 relative">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Refreshed just now</span>
                <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                <span>ID: <span className="font-mono text-indigo-300 font-bold tracking-wider">{applicationId || 'PENDING'}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Need help? <a href="/contact" className="underline hover:text-indigo-400">Contact support</a> or visit the bus office.
        </p>
      </div>
    </div>
  );
}

return (
  <div className="min-h-screen bg-[#05060e] dark:bg-[#05060e] overflow-x-hidden">
    <ApplyFormNavbar />

    {/* Decorative background elements */}
    <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px]" />
    </div>

    <div className="relative z-10 pt-16 sm:pt-24 pb-16 min-h-screen">
      <div className="flex flex-col md:flex-row justify-start px-4 sm:px-12 max-w-[1600px] mx-auto">
        {/* Left Sidebar - Fixed Vertical Navigation (Desktop) */}
        <div className="hidden md:flex fixed left-10 top-[calc(50%+28px)] -translate-y-1/2 w-72 flex-col gap-4 z-50">
          <div className="bg-[#0c0e1a]/60 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl">
            <FormStepper
              steps={STEP_LABELS}
              currentStep={currentStep}
              onStepClick={(step) => goToStep(step)}
              vertical={true}
              isStepComplete={isStepComplete}
              visitedSteps={visitedSteps}
            />
          </div>
        </div>

        {/* Mobile Stepper - Horizontal */}
        <div className="w-full md:hidden mb-8">
          <div className="bg-[#0c0e1a]/40 backdrop-blur-md border border-slate-800/50 rounded-2xl p-4 py-8">
            <FormStepper
              steps={STEP_LABELS}
              currentStep={currentStep}
              onStepClick={(step) => goToStep(step)}
              isStepComplete={isStepComplete}
              visitedSteps={visitedSteps}
            />
          </div>
        </div>

        {/* Right Side - Form Content */}
        <div className="flex-1 w-full max-w-4xl ml-0 md:ml-85 flex flex-col gap-6">
          <div className="bg-[#0c0e1a]/80 backdrop-blur-xl border border-slate-800/50 rounded-3xl shadow-2xl overflow-hidden p-0 sm:p-8 animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col">
            <div className="p-6 sm:p-2">
              {currentStep === 1 && (
                <Step1Personal
                  formData={formData}
                  handleInputChange={handleInputChange}
                  onNext={goToNextStep}
                  currentUser={currentUser}
                  profilePhotoUrl={profilePhotoUrl}
                  finalImageUrl={finalImageUrl}
                  setShowProfileUpdateModal={setShowProfileUpdateModal}
                  handleImageRemove={handleImageRemove}
                />
              )}

              {currentStep === 2 && (
                <Step2Academic
                  formData={formData}
                  handleInputChange={handleInputChange}
                  onNext={goToNextStep}
                  onPrev={goToPrevStep}
                  handleFacultySelect={handleFacultySelect}
                  handleDepartmentSelect={handleDepartmentSelect}
                />
              )}

              {currentStep === 3 && (
                <Step3Bus
                  formData={formData}
                  handleInputChange={handleInputChange}
                  onNext={goToNextStep}
                  onPrev={goToPrevStep}
                  routes={routes}
                  buses={buses}
                  setCapacityCheckResult={setCapacityCheckResult}
                  handleRefChange={handleRefChange}
                  applicationState={applicationState}
                />
              )}

              {currentStep === 4 && (
                <Step4ServicePayment
                  formData={formData}
                  handleInputChange={handleInputChange}
                  onNext={goToNextStep}
                  onPrev={goToPrevStep}
                  currentUser={currentUser}
                  calculateTotalFee={calculateTotalFee}
                  handleSessionDurationChange={handleSessionDurationChange}
                  deadlineConfig={deadlineConfig}
                  applicationState={applicationState}
                  checkFormCompletion={checkFormCompletion}
                  setPaymentCompleted={setPaymentCompleted}
                  setPaymentDetails={setPaymentDetails}
                  setUseOnlinePayment={setUseOnlinePayment}
                  setApplicationState={setApplicationState}
                  setReceiptFile={setReceiptFile}
                  setReceiptPreview={setReceiptPreview}
                  showToast={showToast}
                />
              )}

              {currentStep === 5 && (
                <Step5Review
                  formData={formData}
                  handleInputChange={handleInputChange}
                  onPrev={goToPrevStep}
                  onNext={() => { }}
                  applicationState={applicationState}
                  handleSubmitApplication={handleSubmitApplication}
                  declarationAgreed={declarationAgreed}
                  setDeclarationAgreed={setDeclarationAgreed}
                  validateForm={validateForm}
                  saving={saving}
                  handleSaveDraft={handleSaveDraft}
                  submitting={submitting}
                  useOnlinePayment={useOnlinePayment}
                  finalImageUrl={finalImageUrl}
                />
              )}
            </div>
          </div>

          {/* Mobile Actions area */}
          <div className="md:hidden flex justify-center mt-4 text-center">
            <Button variant="ghost" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-[10px] text-slate-500 hover:text-white">
              Back to top
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={showDeletePaymentDialog} onOpenChange={setShowDeletePaymentDialog}>
      <DialogContent className="bg-slate-950 border-slate-900 max-w-sm rounded-xl py-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
            <RotateCcw className="w-8 h-8 text-red-500" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white mb-2 text-center">Reset Application?</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm text-center">
              This will delete all current payment data and reset your application progress. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center gap-3 pt-6 flex-row">
            <Button variant="outline" onClick={() => setShowDeletePaymentDialog(false)} className="flex-1 bg-transparent border-slate-800 text-slate-400 hover:bg-slate-900 h-11">Cancel</Button>
            <Button variant="destructive" onClick={performFullReset} className="flex-1 bg-red-600 hover:bg-red-700 font-bold h-11">Reset All</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

    {showProfileUpdateModal && (
      <ProfileImageAddModal
        isOpen={showProfileUpdateModal}
        onClose={() => setShowProfileUpdateModal(false)}
        onConfirm={handleProfileImageUpdate}
        immediateUpload={false}
      />
    )}
  </div>
);
}

export default function ApplicationFormPage() {
  return (
    <ErrorBoundary>
      <ApplicationFormContent />
    </ErrorBoundary>
  );
}


