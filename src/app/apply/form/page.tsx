"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Save,
  Send,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Upload,
  X,
  Shield,
  FileText,
  Info,
  RotateCcw,
  Camera,
  ArrowRight
} from 'lucide-react';
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
  clearPaymentSession
} from '@/lib/payment/application-payment.service';
import {
  safeGetJSON,
  safeSetJSON,
  safeRemoveItem,
  getStorageInfo
} from '@/lib/utils/safe-storage';
import {
  checkCapacityForApplication,
  checkBusCapacity,
  createOverloadNotification,
  createNearCapacityNotification,
  type CapacityCheckResult
} from '@/lib/bus-capacity-checker';
import { useToast } from '@/contexts/toast-context';
import { uploadImage } from '@/lib/upload';
import { PremiumPageLoader } from '@/components/LoadingSpinner';
import { cn } from '@/lib/utils';

function ApplicationFormContent() {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const verificationInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<ApplicationFormData>({
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
    shift: '',
    sessionInfo: {
      sessionStartYear: new Date().getFullYear(),
      durationYears: 0,
      sessionEndYear: new Date().getFullYear(),
      feeEstimate: 0
    },
    paymentInfo: {
      paymentMode: 'offline',
      amountPaid: 0,
      paymentEvidenceProvided: false,
      // Offline fields
      paymentReference: '', // UPI Transaction ID
      paymentEvidenceUrl: '' // Receipt URL
      // Online payment fields will be added dynamically when payment is completed
    },
    declarationAccepted: false,
    understandsVerification: false
  });

  // Profile photo state
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string>('');

  const [applicationId, setApplicationId] = useState<string>('');
  const [applicationState, setApplicationState] = useState<ApplicationState>('noDoc');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [moderators, setModerators] = useState<ModeratorProfile[]>([]);
  const [selectedModerator, setSelectedModerator] = useState<string>('');
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [facultySelected, setFacultySelected] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [declarationAgreed, setDeclarationAgreed] = useState(false);
  const [busFees, setBusFees] = useState(0);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [assignedBusInfo, setAssignedBusInfo] = useState<any>(null);

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

  const toastShownRef = useRef(false);

  // Verification state
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verificationCodeId, setVerificationCodeId] = useState<string>('');
  const [verificationExpiry, setVerificationExpiry] = useState<string>('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdownTime, setCountdownTime] = useState(0);
  const [codesSentToday, setCodesSentToday] = useState(0);
  const [maxCodesReached, setMaxCodesReached] = useState(false);

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persistence for application state
  useEffect(() => {
    if (applicationState !== 'noDoc' && applicationState !== 'submitted') {
      localStorage.setItem('applicationState', applicationState);
    }
  }, [applicationState]);

  // Bus capacity check state
  const [capacityCheckResult, setCapacityCheckResult] = useState<CapacityCheckResult | null>(null);
  const [checkingCapacity, setCheckingCapacity] = useState(false);
  const [showCapacityWarning, setShowCapacityWarning] = useState(false);





  // Countdown timer for resend button - based on actual expiry time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (verificationExpiry && codeSent) {
      interval = setInterval(() => {
        const now = new Date().getTime();
        const expiry = new Date(verificationExpiry).getTime();
        const remaining = Math.max(0, Math.floor((expiry - now) / 1000));

        if (remaining <= 0) {
          setCodeSent(false);
          setCountdownTime(0);
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        } else {
          setCountdownTime(remaining);
        }
      }, 1000);
    }

    // Cleanup function - CRITICAL for mobile
    return () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  }, [verificationExpiry, codeSent]);

  // Focus input when moderator is selected
  useEffect(() => {
    if (selectedModerator && showVerificationDialog) {
      setTimeout(() => {
        verificationInputRef.current?.focus();
      }, 100);
    }
  }, [selectedModerator, showVerificationDialog]);

  // Format countdown time to MM:SS
  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    console.log('📋 Application Form - Auth State:', {
      loading,
      currentUser: !!currentUser,
      userData: !!userData,
      userRole: userData?.role
    });

    if (!loading && !currentUser) {
      console.log('🔄 No user, redirecting to login');
      router.push('/login');
      return;
    }

    if (userData && userData.role) {
      console.log('🔄 User has role, redirecting to dashboard');
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
            console.log('✅ User has existing application in state:', data.application?.state);

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

      // Proceed to load resources if not submitted
      if (currentUser) {
        console.log('✅ Loading application form resources');
        loadResources();
        loadDraftOrExisting();
      }
    };

    if (currentUser && !userData?.role) {
      checkExistingApplication();
    }
  }, [loading, currentUser, userData, router, applicationId]); // Added applicationId dependency just in case



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

      console.log('🛣️ Loaded routes:', routesData);
      setRoutes(routesData);
      setBuses(busesData);

      if (modsRes.ok) {
        const modsData = await modsRes.json();
        console.log('📋 Moderators loaded:', modsData);
        console.log('📊 Number of moderators:', modsData.moderators?.length || 0);
        setModerators(modsData.moderators || []);
      } else {
        console.error('❌ Failed to load moderators:', modsRes.status, modsRes.statusText);
        const errorData = await modsRes.text();
        console.error('Error response:', errorData);
        showToast('Failed to load moderators. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error loading resources:', error);
      showToast('Failed to load form resources', 'error');
    } finally {
      setLoadingResources(false);
    }
  };

  const loadDraftOrExisting = async () => {
    try {
      // First, always check localStorage for any draft data
      const draftResult = safeGetJSON<ApplicationFormData>('applicationDraft');
      if (draftResult.success && draftResult.data) {
        console.log('📋 Loading draft from safe storage');
        const draft = draftResult.data;

        // Always reset declaration state on refresh and clear blob URLs
        // Create a default state to merge with check for nested objects
        const defaultState: ApplicationFormData = {
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
          shift: 'morning',
          sessionInfo: {
            sessionStartYear: new Date().getFullYear(),
            durationYears: 0,
            sessionEndYear: new Date().getFullYear(),
            feeEstimate: 0
          },
          paymentInfo: {
            paymentMode: 'offline',
            amountPaid: 0,
            paymentEvidenceProvided: false,
            paymentReference: '',
            paymentEvidenceUrl: ''
          },
          declarationAccepted: false,
          understandsVerification: false
        };

        const draftWithoutDeclaration = {
          ...defaultState,
          ...draft,
          sessionInfo: {
            ...defaultState.sessionInfo,
            ...(draft.sessionInfo || {}),
            sessionStartYear: new Date().getFullYear(),
            sessionEndYear: new Date().getFullYear() + (draft.sessionInfo?.durationYears || 0)
          },
          paymentInfo: {
            ...defaultState.paymentInfo,
            ...(draft.paymentInfo || {}),
            paymentEvidenceUrl: (draft.paymentInfo?.paymentEvidenceUrl?.startsWith('blob:')) ? '' : (draft.paymentInfo?.paymentEvidenceUrl || '')
          },
          // Always reset sensitive/transient fields
          declarationAccepted: false,
          profilePhotoUrl: '',
        };

        setFormData(draftWithoutDeclaration);
        setReceiptPreview(draft.paymentInfo?.paymentEvidenceUrl || '');
        setReceiptFile(null); // No file stored in local storage
        setProfilePhotoUrl(''); // Clear profile photo on refresh

        // Set application state
        const isOnlinePaid = draft.paymentInfo?.paymentMode === 'online' &&
          (draft.paymentInfo?.razorpayPaymentId || draft.paymentInfo?.paymentStatus === 'success');

        const savedState = localStorage.getItem('applicationState') as ApplicationState;

        if (isOnlinePaid) {
          // If payment is complete, we check if the form was previously in 'verified' state (stored) 
          // OR if it looks submitted. But if loading a draft for editing, stay in 'draft'.
          // Only set to verified if it was explicitly saved as such.
          // However, if we just rely on stored state, we might miss the "Payment Complete -> Auto Verify" logic.
          // Let's rely on localStorage 'applicationState' primarily.

          if (savedState === 'verified' || savedState === 'submitted') {
            console.log('💳 Online payment detected in draft (resource load) AND saved state is verified/submitted');
            setApplicationState(savedState);
          } else {
            // Default to draft so user can edit details even if paid
            console.log('💳 Online payment detected but staying in draft mode for editing');
            setApplicationState('draft');
          }
        } else if (savedState && savedState !== 'noDoc') {
          console.log('📋 Restoring saved application state (resource load):', savedState);
          setApplicationState(savedState);
        } else {
          setApplicationState('draft');
        }

        // Set facultySelected to true if faculty is already selected
        if (draft.faculty) {
          setFacultySelected(true);
        }

        // Restore stops for selected route if routeId exists (handled by component now)

      }

      // Then check for existing application in database
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/my-application', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.application) {
          console.log('📋 Loading existing application from database');
          setApplicationId(data.application.applicationId);
          setApplicationState(data.application.state);
          setFormData(data.application.formData);
          setReceiptPreview(data.application.formData.paymentInfo.paymentEvidenceUrl || '');
          setReceiptFile(null); // No file stored for existing applications
          setProfilePhotoUrl(data.application.formData.profilePhotoUrl || '');

          if (data.application.pendingVerifier) {
            // Extract moderatorUid from pendingVerifier if needed
            setVerificationCodeId(data.application.verificationCodeId || '');
            setVerificationExpiry(data.application.verificationExpiry || '');
          }

          if (data.application.state === 'verified' || data.application.state === 'submitted') {
            // Application already submitted, show message
            showToast('Application already submitted. Waiting for approval.', 'info');
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error loading application:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev };
      const keys = field.split('.');
      let current: any = updated;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      // Auto-save to local storage (excluding blob URLs) - SAFE for mobile
      const dataToSave = {
        ...updated,
        profilePhotoUrl: updated.profilePhotoUrl?.startsWith('blob:') ? '' : updated.profilePhotoUrl,
        paymentInfo: {
          ...updated.paymentInfo,
          paymentEvidenceUrl: updated.paymentInfo?.paymentEvidenceUrl?.startsWith('blob:') ? '' : updated.paymentInfo?.paymentEvidenceUrl
        }
      };

      const saveResult = safeSetJSON('applicationDraft', dataToSave);
      if (!saveResult.success) {
        console.warn('⚠️ Failed to auto-save draft:', saveResult.error);
        // Don't crash the app, just log the error
      }

      return updated;
    });
  };

  const handleFacultySelect = (faculty: string) => {
    handleInputChange('faculty', faculty);
    setFacultySelected(true);
  };

  const handleDepartmentSelect = (department: string) => {
    handleInputChange('department', department);
  };

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
    handleInputChange('profilePhotoUrl', newImageUrl);
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
    handleInputChange('profilePhotoUrl', '');
  };

  const handleRefChange = (field: string, value: any) => {
    handleInputChange(field, value);
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Create local preview URL
    const previewUrl = URL.createObjectURL(file);

    // Store file and preview
    setReceiptFile(file);
    setReceiptPreview(previewUrl);
    handleInputChange('paymentInfo.paymentEvidenceProvided', true);

    showToast('Receipt selected successfully', 'success');
  };

  const handleSessionDurationChange = (duration: string) => {
    const durationNum = parseInt(duration) || 1;
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
    handleInputChange('paymentInfo.amountPaid', newFee);
  };

  // Load bus fees from Firestore
  useEffect(() => {
    const loadBusFees = async () => {
      try {
        const response = await fetch(`/api/settings/bus-fees?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          const fee = data.fees || data.amount || 0;
          console.log('💰 Loaded bus fee from API:', fee);
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

  // Sync effect: Update estimates whenever busFees or duration changes
  useEffect(() => {
    if (formData.sessionInfo.durationYears > 0) {
      const newFee = calculateTotalFee(formData.sessionInfo.durationYears, formData.shift);

      // Only update if changed to avoid loops (or if current is 0/stale)
      if (newFee !== formData.sessionInfo.feeEstimate || newFee !== formData.paymentInfo.amountPaid) {
        console.log(`💰 Syncing fee: ${newFee} (was Est: ${formData.sessionInfo.feeEstimate}, Paid: ${formData.paymentInfo.amountPaid})`);
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


  const validateForm = () => {
    console.log('🔍 Running form validation with data:', formData);

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

    // Stop is now optional/auto-handled, strict check removed per requirement

    // Session Duration validation
    if (!formData.sessionInfo.durationYears || formData.sessionInfo.durationYears === 0) {
      showToast('Please select session duration', 'error');
      return false;
    }

    // Profile Photo validation
    if (!formData.profilePhotoUrl) {
      showToast('Please upload a profile photo', 'error');
      return false;
    }

    return true;
  };

  const checkFormCompletion = () => {
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
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const hasData = formData.fullName || formData.phoneNumber || formData.enrollmentId || formData.faculty;
      if (hasData) {
        showToast('✅ Draft auto-saved successfully!', 'success');
      } else {
        showToast('📝 No data to save yet.', 'info');
      }
    } catch (error) {
      console.error('Error in save draft animation:', error);
      showToast('Draft save animation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestVerification = async () => {
    if (!selectedModerator) {
      showToast('Please select a moderator', 'error');
      return;
    }
    if (!declarationAgreed) {
      showToast('Please accept the declaration first', 'error');
      return;
    }

    setRequestingVerification(true);
    try {
      const token = await currentUser?.getIdToken();

      // First, create/update the application in database if needed
      let currentApplicationId = applicationId;
      if (!currentApplicationId) {
        const createResponse = await fetch('/api/applications/save-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ formData })
        });

        if (createResponse.ok) {
          const createData = await createResponse.json();
          currentApplicationId = createData.applicationId;
          setApplicationId(currentApplicationId);
        } else {
          throw new Error('Failed to create application for verification');
        }
      }

      // Request verification code
      const response = await fetch('/api/applications/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ applicationId: currentApplicationId, moderatorUid: selectedModerator })
      });

      if (response.ok) {
        const data = await response.json();
        setApplicationState('awaiting_verification');
        setVerificationCodeId(data.codeId);
        setVerificationExpiry(data.expiresAt);
        showToast('Verification code sent to moderator. Please visit the Bus Office.', 'success');
      } else {
        throw new Error('Failed to request verification');
      }
    } catch (error: any) {
      console.error('Error requesting verification:', error);
      showToast(error.message || 'Failed to request verification', 'error');
    } finally {
      setRequestingVerification(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!selectedModerator) {
      showToast('Please select a moderator first', 'error');
      return;
    }

    setSendingCode(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/send-verification-code-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ formData, moderatorUid: selectedModerator })
      });

      if (response.ok) {
        const data = await response.json();
        setApplicationState('awaiting_verification');
        setVerificationCodeId(data.codeId);
        setVerificationExpiry(data.expiresAt);
        setCodeSent(true);
        setCodesSentToday(prev => prev + 1);
        showToast('Verification code sent to moderator successfully!', 'success');
      } else {
        throw new Error('Failed to send verification code');
      }
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      showToast(error.message || 'Failed to send verification code', 'error');
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showToast('Please enter the 6-digit code', 'error');
      return;
    }

    setVerifyingCode(true);
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/applications/verify-code-only', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          codeId: verificationCodeId,
          code: verificationCode
        })
      });

      const result = await response.json();

      if (response.ok && result.verified) {
        setApplicationState('verified');
        showToast('Verification successful! You can now submit your application.', 'success');
        setVerificationCode('');
        setCodeSent(false);
        setCountdownTime(0);
        setVerificationExpiry('');
      } else {
        const errorMessage = result.message || 'Invalid or expired code';
        showToast(errorMessage, 'error');
      }
    } catch (error: any) {
      console.error('Error verifying code:', error);
      showToast('Verification failed. Please try again.', 'error');
    } finally {
      setVerifyingCode(false);
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
      shift: 'morning',
      sessionInfo: {
        sessionStartYear: new Date().getFullYear(),
        durationYears: 0,
        sessionEndYear: new Date().getFullYear(),
        feeEstimate: 0
      },
      paymentInfo: {
        paymentMode: 'offline',
        amountPaid: 0,
        paymentEvidenceProvided: false,
        paymentEvidenceUrl: '',
        paymentReference: ''
      },
      declarationAccepted: false,
      understandsVerification: false
    });

    // Clear all related state
    setPreviewUrl('');
    setFinalImageUrl(null);
    setImagePosition({ x: 0, y: 0, scale: 1 });
    setProfilePhotoFile(null);
    setProfilePhotoUrl('');
    setApplicationId('');
    setApplicationState('noDoc');
    setFacultySelected(false);
    setSelectedModerator('');
    setDeclarationAgreed(false);
    setPaymentCompleted(false);
    setPaymentDetails(null);
    setUseOnlinePayment(false);
    setReceiptPreview('');
    setReceiptFile(null);

    localStorage.removeItem('applicationDraft');
    localStorage.removeItem('verificationCodeId');
    localStorage.removeItem('verificationExpiry');
    localStorage.removeItem('selectedModerator');
    localStorage.removeItem('codesSentToday');
    localStorage.removeItem('maxCodesReached');
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
        shift: '',
        sessionInfo: {
          sessionStartYear: new Date().getFullYear(),
          durationYears: 0,
          sessionEndYear: new Date().getFullYear(),
          feeEstimate: 0
        },
        paymentInfo: currentPaymentInfo, // Key: Preserve this!
        declarationAccepted: false,
        understandsVerification: false
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
      setSelectedModerator('');
      setDeclarationAgreed(false);

      setReceiptPreview('');
      setReceiptFile(null);

      // Clear localStorage BUT preserve payment keys
      localStorage.removeItem('applicationDraft');
      localStorage.removeItem('verificationCodeId');
      localStorage.removeItem('verificationExpiry');
      localStorage.removeItem('selectedModerator');

      // Do NOT remove paymentSessions, currentPaymentSession, etc.

      showToast('Form reset successful.', 'info');
    } else {
      // Case 3: No online payment -> Full Reset
      performFullReset();
    }
  };

  const handleSubmitApplication = async () => {
    if (applicationState !== 'verified') {
      showToast('Please complete verification first', 'error');
      return;
    }

    if (!formData.declarationAccepted) {
      showToast('Please accept the declaration first', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // First, handle profile photo upload if we have a file waiting
      let finalProfilePhotoUrl = formData.profilePhotoUrl;

      if (profilePhotoFile) {
        // Show uploading toast - REMOVED per user request
        // const uploadToast = showToast('Uploading profile photo...', 'info');

        try {
          const uploadedUrl = await uploadImage(profilePhotoFile);
          if (uploadedUrl) {
            finalProfilePhotoUrl = uploadedUrl;
            console.log('✅ Profile photo uploaded successfully:', finalProfilePhotoUrl);
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
        console.error('❌ Attempted to submit blob URL for profile photo');
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
      console.log('🚀 Starting application submission process...');

      // Force token refresh to ensure authentication is valid (handles case where phone screen was off)
      let token;
      try {
        console.log('🔄 Refreshing auth token...');
        token = await currentUser?.getIdToken(true);
      } catch (authError) {
        console.error('❌ Failed to refresh auth token:', authError);
        // Fallback to existing token if refresh fails
        token = await currentUser?.getIdToken();
      }

      if (!token) {
        console.error('❌ Failed to get auth token');
        throw new Error('Authentication session expired. Please refresh the page and sign in again.');
      }
      console.log('✅ Auth token retrieved successfully');

      // Upload receipt file if there's one (using same /api/upload as profile photo)
      let receiptUrl = formData.paymentInfo.paymentEvidenceUrl || '';
      let receiptProvided = formData.paymentInfo.paymentEvidenceProvided;

      if (receiptFile) {
        console.log('📤 Uploading receipt during form submission...');
        const formDataUpload = new FormData();
        formDataUpload.append('file', receiptFile);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formDataUpload
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          receiptUrl = uploadData.url;
          receiptProvided = true; // Mark as provided when receipt is uploaded
          console.log('✅ Receipt uploaded successfully:', receiptUrl);
        } else {
          const errorText = await uploadResponse.text();
          console.error('❌ Receipt upload failed:', errorText);
          throw new Error('Failed to upload payment receipt. Please check your connection and try again.');
        }
      }

      // Submit application with verification code ID
      console.log('📤 Sending final application data to /api/applications/submit-final...');
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
          verificationCodeId: verificationCodeId,
          needsCapacityReview: capacityCheckResult?.needsCapacityReview || false
        })
      });

      console.log('📥 Response received from submit-final:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Application submission confirmed by server');

        // Create admin notification if bus is overloaded and no alternatives exist
        if (capacityCheckResult?.requiresAdminNotification &&
          capacityCheckResult.selectedBus &&
          !capacityCheckResult.hasAlternatives) {
          console.log('🚨 Creating overload notification for admins/moderators');

          let stopName = formData.stopId || '';
          const route = routes.find(r => r.routeId === formData.routeId);
          if (route?.stops) {
            const stop = route.stops.find((s: any) => (s.stopId || s.id || s.name) === formData.stopId);
            if (stop) stopName = (stop as any).name || (stop as any).stopName || stopName;
          }

          await createOverloadNotification(
            formData.fullName,
            formData.enrollmentId,
            capacityCheckResult.selectedBus,
            stopName
          );
          console.log('✅ Overload notification sent to admins/moderators');
        }

        // Create admin notification if bus is near capacity (>95%)
        if (capacityCheckResult?.isNearCapacity &&
          capacityCheckResult.selectedBus &&
          !capacityCheckResult.isFull) {
          console.log('⚠️ Creating near-capacity notification for admins/moderators');

          let stopName = formData.stopId || '';
          const route = routes.find(r => r.routeId === formData.routeId);
          if (route?.stops) {
            const stop = route.stops.find((s: any) => (s.stopId || s.id || s.name) === formData.stopId);
            if (stop) stopName = (stop as any).name || (stop as any).stopName || stopName;
          }

          // Calculate current percentage (before enrollment)
          const currentPercentage = capacityCheckResult.selectedBus.capacity > 0
            ? (capacityCheckResult.selectedBus.currentMembers / capacityCheckResult.selectedBus.capacity) * 100
            : 0;

          await createNearCapacityNotification(
            formData.fullName,
            formData.enrollmentId,
            capacityCheckResult.selectedBus,
            stopName,
            currentPercentage,
            capacityCheckResult.capacityPercentage
          );
          console.log('✅ Near-capacity notification sent to admins/moderators');
        }

        showToast('Application submitted successfully! Waiting for approval from the Managing Team.', 'success');

        // Clean up all localStorage data related to the application
        const cleanupKeys = [
          'applicationDraft', 'applicationState', 'verificationCodeId',
          'verificationExpiry', 'selectedModerator', 'codesSentToday',
          'maxCodesReached', 'receiptPreview', 'profilePhotoPreview',
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
        console.log(`🧹 Cleared ${keysToRemove.length} application-related localStorage keys.`);

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
            console.error('❌ Failed to parse error response as JSON:', text);
            errorData = { message: `Server error (${response.status}): ${text.substring(0, 100)}...` };
          }
        } catch (readError) {
          errorData = { message: `Critical server error (${response.status})` };
        }
        throw new Error(errorData.message || errorData.error || 'Failed to submit application');
      }
    } catch (error: any) {
      console.error('❌ CRITICAL: Error submitting application:', error);
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
    const savedDraft = localStorage.getItem('applicationDraft');
    const savedApplicationId = localStorage.getItem('applicationId');
    const savedSelectedModerator = localStorage.getItem('selectedModerator');
    const savedVerificationCodeId = localStorage.getItem('verificationCodeId');
    const savedVerificationExpiry = localStorage.getItem('verificationExpiry');
    const savedCodesSentToday = localStorage.getItem('codesSentToday');
    const savedMaxCodesReached = localStorage.getItem('maxCodesReached');

    // Check for completed payment
    if (currentUser) {
      const completedPayment = hasCompletedPayment(currentUser.uid, 'new_registration');
      if (completedPayment) {
        setPaymentCompleted(true);
        const session = getCurrentPaymentSession();
        if (session) {
          setPaymentDetails({
            paymentId: session.razorpayPaymentId,
            orderId: session.razorpayOrderId,
            amount: session.amount
          });
        }
      }
    }
  }, [currentUser]);

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white font-sans selection:bg-indigo-500/30 relative overflow-hidden flex flex-col">
        <ApplyFormNavbar />

        {/* Ambient Background Effects */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse-slow"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] animate-pulse-slow delay-700"></div>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-2xl animate-in fade-in zoom-in duration-700 slide-in-from-bottom-4">

            {/* Main Glass Card */}
            <div className="relative bg-slate-900 border border-indigo-500/30 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/10">

              {/* Top Gradient Accent */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-70"></div>

              <div className="p-8 sm:p-12 relative">
                {/* Hero Icon Section */}
                <div className="flex flex-col items-center justify-center mb-10">
                  <div className="relative mb-8 group cursor-default">
                    {/* Pulsing rings */}
                    <div className="absolute inset-0 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                    <div className="absolute inset-0 border-2 border-indigo-500/10 rounded-full animate-[ping_3s_linear_infinite]"></div>
                    <div className="absolute inset-2 border border-indigo-500/30 rounded-full"></div>

                    {/* Core Icon */}
                    <div className="relative w-24 h-24 bg-gradient-to-br from-slate-800 to-slate-900 rounded-full flex items-center justify-center shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)] ring-1 ring-indigo-500/20">
                      <CheckCircle className="w-10 h-10 text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" strokeWidth={2.5} />
                    </div>

                    {/* Floating Status Pill */}
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/30 py-1 px-3 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
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
                <div className="mb-10 bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm">
                  <div className="flex items-center justify-between relative">
                    {/* Connecting Line */}
                    <div className="absolute top-1/3 left-4 right-4 h-0.5 bg-slate-700/50 -translate-y-1/2 z-0"></div>
                    <div className="absolute top-1/3 left-4 right-1/2 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 -translate-y-1/2 z-0"></div>

                    {/* Step 1 */}
                    <div className="relative z-10 flex flex-col items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-900/80 border-2 border-indigo-500 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(99,102,241,0.4)]">
                        <CheckCircle className="w-4 h-4 text-indigo-200" />
                      </div>
                      <span className="text-xs font-semibold text-indigo-200 tracking-wide uppercase">Submitted</span>
                    </div>

                    {/* Step 2 */}
                    <div className="relative z-10 flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="text-xs font-semibold text-blue-200 tracking-wide uppercase">Under Review</span>
                    </div>

                    {/* Step 3 */}
                    <div className="relative z-10 flex flex-col items-end gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Approved</span>
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
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
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
              Need help? <a href="/contact" className="underline hover:text-indigo-400 transition-colors">Contact support</a> or visit the bus office.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || loadingResources) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#020817]">
        <PremiumPageLoader
          message="Preparing Application Form..."
          subMessage="Loading secure resources..."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/20">
      <ApplyFormNavbar />
      <div className="py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <div className="max-w-7xl mx-auto px-2 sm:px-3">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div>
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Bus Service Application</h1>
              <p className="text-[11px] sm:text-xs text-gray-700 dark:text-gray-300 mt-0.5 font-medium leading-relaxed">
                Complete all sections and get verified to submit your application
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              {applicationState !== 'noDoc' && applicationState !== 'draft' && (
                <Badge variant={
                  applicationState === 'verified' ? 'default' :
                    applicationState === 'awaiting_verification' ? 'secondary' :
                      'outline'
                } className="text-[10px] sm:text-xs px-2 py-0.5">
                  {applicationState === 'awaiting_verification' ? 'Awaiting Verification' :
                    applicationState === 'verified' ? 'Verified' : 'Unknown'}
                </Badge>
              )}
              {applicationState === 'draft' && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-950/20 rounded-full border border-green-100 dark:border-green-900/30 text-green-600 dark:text-green-400">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Auto-save active</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-2 sm:px-3">
          <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-indigo-100 dark:border-indigo-900/30 shadow-lg overflow-hidden pt-0">
            <CardHeader className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/40 dark:via-purple-950/40 dark:to-pink-950/40 border-b border-indigo-100 dark:border-indigo-900/30 p-4 sm:p-6 mb-0">
              <div className="flex justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base md:text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent mb-1 truncate">New Application</CardTitle>
                  <CardDescription className="text-[10px] md:text-base text-gray-600 dark:text-gray-400 leading-relaxed font-medium line-clamp-1 sm:line-clamp-none">Please fill in all required information accurately</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleResetForm}
                  className="shrink-0 bg-red-50 hover:bg-red-100 text-red-700 border-red-200 hover:border-red-300 dark:bg-red-950/20 dark:hover:bg-red-950/30 dark:text-red-400 dark:border-red-800 dark:hover:border-red-700 transition-all duration-200 h-8 px-3 text-xs sm:h-10 sm:px-5 sm:text-sm font-semibold shadow-sm hover:shadow flex items-center justify-center gap-2"
                >
                  <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Reset Form</span>
                  <span className="xs:hidden">Reset</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="space-y-3">
                {/* Profile Photo Section - Modal Position Picker */}
                {/* Profile Photo Section - Modal Position Picker */}
                <div className="flex flex-col items-center justify-center mb-8">
                  <div className="relative group cursor-pointer" onClick={() => setShowProfileUpdateModal(true)}>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImageRemove();
                        }}
                        className="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors z-10"
                        title="Remove photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowProfileUpdateModal(true)}
                      className="text-xs font-semibold bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm"
                    >
                      {finalImageUrl ? 'Change Photo' : 'Upload Profile Photo'}
                    </Button>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 max-w-[200px] text-center leading-tight">
                      Click to upload. Use a clear face photo for your bus pass.
                    </p>
                  </div>

                  <ProfileImageAddModal
                    isOpen={showProfileUpdateModal}
                    onClose={() => setShowProfileUpdateModal(false)}
                    onConfirm={handleProfileImageUpdate}
                    immediateUpload={false}
                  />
                </div>

                {/* Personal and Academic Information Header - Full Width */}
                <div className="pb-2 border-b-2 border-blue-300 dark:border-blue-900/30 mb-3">
                  <h3 className="text-base md:text-xl font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <div className="p-1 rounded-md bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-sm">
                      <svg className="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    Personal and Academic Information
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column */}
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="fullName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Full Name *
                      </Label>
                      <Input
                        type="text"
                        id="fullName"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        placeholder="Enter your full name"
                        className="text-xs h-9"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="gender" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Gender *
                      </Label>
                      <Select
                        value={formData.gender}
                        onValueChange={(value) => handleInputChange('gender', value)}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Select Gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="dob" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                          Date of Birth *
                        </Label>
                        <EnhancedDatePicker
                          id="dob"
                          value={formData.dob}
                          onChange={(value) => {
                            handleInputChange('dob', value);
                            if (value) {
                              const birthDate = new Date(value);
                              const today = new Date();
                              let age = today.getFullYear() - birthDate.getFullYear();
                              const monthDiff = today.getMonth() - birthDate.getMonth();
                              if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                age--;
                              }
                              handleInputChange('age', age.toString());
                            }
                          }}
                          onValidationError={(message) => {
                            showToast(message, 'error');
                          }}
                          required
                          validationType="dob-student"
                        />
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-0.5">
                          <span className="w-0.5 h-0.5 bg-blue-500 rounded-full"></span>
                          Must be 12+ years
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="age" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                          Age
                        </Label>
                        <Input
                          type="number"
                          id="age"
                          value={formData.age}
                          readOnly
                          className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-xs h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="phoneNumber" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Phone Number *
                      </Label>
                      <Input
                        type="tel"
                        id="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={(e) => handleInputChange('phoneNumber', e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="10 digit phone number"
                        className="text-xs h-9"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Email Address *
                      </Label>
                      <Input
                        type="email"
                        id="email"
                        value={currentUser?.email || formData.email}
                        disabled
                        className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed text-xs h-9"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Auto-filled from Google
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="alternatePhone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Alternate Phone Number
                      </Label>
                      <Input
                        type="tel"
                        id="alternatePhone"
                        value={formData.alternatePhone}
                        onChange={(e) => handleInputChange('alternatePhone', e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Alternate phone number"
                        className="text-xs h-9"
                      />
                    </div>

                    <div>
                      <Label htmlFor="parentName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Parent Name *
                      </Label>
                      <Input
                        type="text"
                        id="parentName"
                        value={formData.parentName}
                        onChange={(e) => handleInputChange('parentName', e.target.value)}
                        placeholder="Enter parent/guardian name"
                        className="text-xs h-9"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="parentPhone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Parent Phone Number *
                      </Label>
                      <Input
                        type="tel"
                        id="parentPhone"
                        value={formData.parentPhone}
                        onChange={(e) => handleInputChange('parentPhone', e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Parent phone number"
                        className="text-xs h-9"
                        required
                      />
                    </div>
                  </div>

                  {/* Right Column - No separate header, continuation of left */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <FacultyDepartmentSelector
                        onFacultySelect={handleFacultySelect}
                        onDepartmentSelect={handleDepartmentSelect}
                        initialFaculty={formData.faculty}
                        initialDepartment={formData.department}
                      />
                    </div>

                    <div>
                      <Label htmlFor="semester" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Semester *
                      </Label>
                      <Select
                        value={formData.semester}
                        onValueChange={(value) => handleInputChange('semester', value)}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Select Semester" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1st Semester">1st Semester</SelectItem>
                          <SelectItem value="2nd Semester">2nd Semester</SelectItem>
                          <SelectItem value="3rd Semester">3rd Semester</SelectItem>
                          <SelectItem value="4th Semester">4th Semester</SelectItem>
                          <SelectItem value="5th Semester">5th Semester</SelectItem>
                          <SelectItem value="6th Semester">6th Semester</SelectItem>
                          <SelectItem value="7th Semester">7th Semester</SelectItem>
                          <SelectItem value="8th Semester">8th Semester</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="enrollmentId" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Enrollment ID *
                      </Label>
                      <Input
                        type="text"
                        id="enrollmentId"
                        value={formData.enrollmentId}
                        onChange={(e) => handleInputChange('enrollmentId', e.target.value)}
                        placeholder="Enter enrollment ID"
                        className="text-xs h-9"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="bloodGroup" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Blood Group *
                      </Label>
                      <Select
                        value={formData.bloodGroup}
                        onValueChange={(value) => handleInputChange('bloodGroup', value)}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Select Blood Group" />
                        </SelectTrigger>
                        <SelectContent>
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
                    </div>

                    <div>
                      <Label htmlFor="address" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Address *
                      </Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        rows={3}
                        className="resize-none text-xs"
                        placeholder="Enter your complete address"
                      />
                    </div>
                  </div>
                </div>

                {/* Bus Service Session Details */}
                <div>
                  <div className="pb-2 border-b-2 border-emerald-300 dark:border-emerald-900/30 mb-3 pt-5 md:pt-0">
                    <h3 className="text-base md:text-xl font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
                        <svg className="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      Bus Service Session Details
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 mt-2">
                    <div>
                      <Label htmlFor="shift" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Shift *
                      </Label>
                      <Select
                        value={formData.shift}
                        onValueChange={(value) => {
                          handleInputChange('shift', value);
                          // Clear route/bus/stop selection when shift changes to force re-selection
                          handleInputChange('routeId', '');
                          handleInputChange('busId', '');
                          handleInputChange('stopId', '');
                          handleInputChange('busAssigned', '');
                        }}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Select Shift" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Morning">Morning Shift</SelectItem>
                          <SelectItem value="Evening">Evening Shift</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="sessionDuration" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Session Duration *
                      </Label>
                      <Select
                        value={formData.sessionInfo.durationYears > 0 ? formData.sessionInfo.durationYears.toString() : ""}
                        onValueChange={handleSessionDurationChange}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Select Duration" />
                        </SelectTrigger>
                        <SelectContent>
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

                    {/* Route, Bus, Pickup Point Selection - Requires shift to be selected first */}
                    <div className="col-span-1 md:col-span-2">
                      <RouteSelectionSection
                        routes={routes}
                        buses={buses}
                        selectedRouteId={formData.routeId || ''}
                        selectedBusId={formData.busId || ''}
                        selectedStopId={formData.stopId || ''}
                        selectedShift={formData.shift}
                        onReferenceChange={handleRefChange}
                        onCapacityCheckResult={setCapacityCheckResult}
                        isReadOnly={applicationState === 'submitted' || applicationState === 'verified'}
                      />
                    </div>

                    <div>
                      <Label htmlFor="sessionStartYear" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Session Start Year *
                      </Label>
                      <Input
                        type="number"
                        id="sessionStartYear"
                        value={formData.sessionInfo.sessionStartYear}
                        readOnly
                        className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-xs h-9"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Year when service begins
                      </p>
                    </div>

                    {/* Bus Field - Auto-filled or Selectable */}


                    <div>
                      <Label htmlFor="sessionEndYear" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Session End Year
                      </Label>
                      <Input
                        type="number"
                        id="sessionEndYear"
                        value={formData.sessionInfo.sessionEndYear}
                        readOnly
                        className="bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-xs h-9"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Auto-calculated
                      </p>
                    </div>

                    <div>
                      <Label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Estimated Fee
                      </Label>
                      <div className="p-2 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-lg border border-amber-200 dark:border-amber-800 shadow-sm">
                        <p className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                          ₹{formData.sessionInfo.feeEstimate.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 font-medium">
                          Session: July {formData.sessionInfo.sessionStartYear} - July {formData.sessionInfo.sessionEndYear}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Information */}
                <div>
                  <div className="pb-2 border-b-2 border-indigo-300 dark:border-indigo-900/30 pt-5 md:pt-0">
                    <h3 className="text-base md:text-xl font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
                        <svg className="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      Payment Information
                    </h3>
                  </div>
                  {/* Payment Mode Selector */}
                  <PaymentModeSelector
                    isFormComplete={checkFormCompletion()}
                    showHeader={false}
                    amount={formData.sessionInfo.feeEstimate || calculateTotalFee(formData.sessionInfo.durationYears, formData.shift)}
                    duration={formData.sessionInfo.durationYears}
                    sessionStartYear={formData.sessionInfo.sessionStartYear}
                    sessionEndYear={formData.sessionInfo.sessionEndYear}
                    validUntil={calculateSessionDates(
                      formData.sessionInfo.sessionStartYear,
                      formData.sessionInfo.durationYears
                    ).validUntil}
                    userId={currentUser?.uid || ''}
                    userName={formData.fullName}
                    userEmail={formData.email}
                    userPhone={formData.phoneNumber}
                    enrollmentId={formData.enrollmentId}
                    purpose="new_registration"
                    initialPaymentId={formData.paymentInfo.paymentReference}
                    initialReceiptPreview={formData.paymentInfo.paymentEvidenceUrl}
                    onPaymentComplete={(details) => {
                      setPaymentCompleted(true);
                      setPaymentDetails(details);
                      setUseOnlinePayment(true);

                      // Auto-verify for online payments
                      setApplicationState('verified');
                      showToast('Payment successful! Your application is now verified.', 'success');

                      // Update form data with online payment transaction details
                      // Set online payment mode and amount
                      handleInputChange('paymentInfo.paymentMode', 'online');
                      handleInputChange('paymentInfo.amountPaid', details.amount || calculateTotalFee(formData.sessionInfo.durationYears, formData.shift));
                      handleInputChange('paymentInfo.paymentEvidenceProvided', true);

                      // Store Razorpay transaction details
                      handleInputChange('paymentInfo.razorpayPaymentId', details.razorpayPaymentId);
                      handleInputChange('paymentInfo.razorpayOrderId', details.razorpayOrderId);
                      handleInputChange('paymentInfo.paymentStatus', details.paymentStatus || 'success');
                      handleInputChange('paymentInfo.paymentMethod', details.paymentMethod || 'card');
                      handleInputChange('paymentInfo.paymentTime', details.paymentTime);
                    }}
                    onOfflineSelected={(data) => {
                      setUseOnlinePayment(false);
                      // Reset verification state if switching back to offline
                      if (applicationState === 'verified') {
                        setApplicationState('noDoc');
                      }

                      handleInputChange('paymentInfo.paymentMode', 'offline');
                      handleInputChange('paymentInfo.amountPaid', calculateTotalFee(formData.sessionInfo.durationYears, formData.shift));

                      // Store offline payment reference (Transaction ID)
                      if (data.paymentId) {
                        handleInputChange('paymentInfo.paymentReference', data.paymentId);
                      }
                      // Receipt will be uploaded during form submission
                    }}
                    onReceiptFileSelect={(file) => {
                      setReceiptFile(file);
                      const previewUrl = URL.createObjectURL(file);
                      setReceiptPreview(previewUrl);
                    }}
                  />

                </div>

                {/* Verification Status Display */}
                {applicationState === 'verified' && (
                  <div className="mt-3">
                    <div className="p-2 bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/30 dark:via-emerald-950/30 dark:to-teal-950/30 rounded-lg border border-green-300 dark:border-green-800 shadow-sm">
                      <div className="text-xs font-bold text-green-900 dark:text-green-100 flex items-center gap-2">
                        <div className="p-1 rounded-full bg-green-500 text-white shadow-sm">
                          <CheckCircle className="h-3 w-3" />
                        </div>
                        <span>
                          {useOnlinePayment
                            ? "Payment Successful! You can now submit your application directly."
                            : "Verification completed successfully! You can now submit your application."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Declarations */}
                <div>
                  <div className="pb-2 border-b-2 border-rose-300 dark:border-rose-900/30 mb-3 pt-5 md:pt-0">
                    <h3 className="text-base md:text-xl font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-sm">
                        <svg className="w-3 h-3 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      Declarations
                    </h3>
                  </div>
                  <div className="flex items-start space-x-2 mt-3">
                    <Checkbox
                      id="declaration"
                      checked={formData.declarationAccepted}
                      onCheckedChange={(checked: boolean) => {
                        if (checked) {
                          // Run validation before allowing declaration to be checked
                          if (!validateForm()) {
                            return; // Don't proceed if validation fails
                          }

                          // If payment is online, we don't need to show the Important Information (offline verification info)
                          const isOnlinePayment = formData.paymentInfo?.paymentMode === 'online';
                          if (isOnlinePayment) {
                            handleInputChange('declarationAccepted', true);
                            setDeclarationAgreed(true);
                          } else {
                            setShowNoteDialog(true);
                          }
                        } else {
                          handleInputChange('declarationAccepted', false);
                          setDeclarationAgreed(false);
                        }
                      }}
                      className="cursor-pointer mt-0.5"
                    />
                    <label htmlFor="declaration" className="text-[10px] md:text-sm cursor-pointer leading-snug">
                      I declare that all information provided is accurate and complete.
                      I understand that providing false information may result in rejection of my application

                    </label>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="flex-1 h-9 text-xs"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <Save className="h-3 w-3 mr-1.5" />
                        Check Draft
                      </>
                    )}
                  </Button>

                  {applicationState !== 'verified' && (
                    <Button
                      onClick={() => setShowVerificationDialog(true)}
                      disabled={!declarationAgreed}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed h-9 text-xs"
                    >
                      <Shield className="h-3 w-3 mr-1.5" />
                      Request Verification
                    </Button>
                  )}

                  <Button
                    onClick={handleSubmitApplication}
                    disabled={applicationState !== 'verified' || submitting}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed h-9 text-xs"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3 mr-1.5" />
                        {applicationState === 'verified' ? 'Submit Application' : 'Submit'}
                      </>
                    )}
                  </Button>
                </div>

                {applicationState !== 'verified' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 text-center flex items-center justify-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Accept declaration and complete verification to submit
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Note Dialog */}
        <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
          <DialogContent className="sm:max-w-lg bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-0 shadow-2xl">
            <DialogHeader className="space-y-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                  Important Information
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Please read the following carefully:
                </p>
                <ul className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>You must visit the bus office for final verification.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>The moderator will verify your payment and if verification is successful (Moderator provides you the secret verification code), you can finally submit the application form.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>So, if you are not at the bus office, save the form details as draft and on next visit to bus office, verify yourself with the available moderators.</span>
                  </li>
                </ul>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                onClick={() => {
                  setShowNoteDialog(false);
                  handleInputChange('declarationAccepted', true);
                  setDeclarationAgreed(true);
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Okay, I Understand
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog >

        <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
          <DialogContent className="sm:max-w-[440px] bg-[#0a0c10] border-gray-800/50 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] p-0 overflow-hidden gap-0">
            {/* Header Section */}
            <div className="relative overflow-hidden pt-8 pb-6 px-6 text-center">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-green-500/5 to-transparent opacity-50" />
              <div className="relative flex flex-col items-center">
                <div className="mb-4 p-3 bg-green-500/10 rounded-2xl ring-1 ring-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
                  <Shield className="h-6 w-6 text-green-400" />
                </div>
                <DialogTitle className="text-2xl font-bold tracking-tight text-white mb-1">
                  Identity Verification
                </DialogTitle>
                <p className="text-sm text-gray-400 font-medium">
                  Authentication via designated coordinator
                </p>
              </div>
            </div>

            <div className="px-6 pb-8 space-y-7">
              {/* Coordinator Selection Card */}
              <div className="group space-y-3">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="moderatorSelect" className="text-[10px] font-bold uppercase tracking-[0.1em] text-yellow-500/80">
                    Authority Verification
                  </Label>
                </div>

                <div className="relative group">
                  <Select value={selectedModerator} onValueChange={setSelectedModerator}>
                    <SelectTrigger
                      id="moderatorSelect"
                      className="h-14 border-gray-800 bg-[#12141c] hover:bg-[#161924] focus:ring-1 focus:ring-green-500/30 focus:border-green-500/40 transition-all text-sm rounded-xl px-4"
                    >
                      <SelectValue placeholder="Select Coordinator" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#12141c] border-gray-800 text-gray-200">
                      {moderators.length > 0 ? (
                        moderators.map((mod) => (
                          <SelectItem key={mod.moderatorUid} value={mod.moderatorUid} className="focus:bg-green-500/10 focus:text-green-400 py-3 cursor-pointer">
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-sm">{mod.name}</span>
                                <span className="text-[10px] text-gray-500">ID: {mod.empId}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="" disabled>No active coordinators</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Send Button - Premium Look */}
                {!verificationCodeId && !codeSent && (
                  <Button
                    onClick={() => {
                      if (!selectedModerator) {
                        showToast('Please select a coordinator first', 'info');
                        return;
                      }
                      handleSendVerificationCode();
                    }}
                    className="w-full h-12 bg-white hover:bg-gray-100 text-black font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_20px_rgba(255,255,255,0.05)] active:scale-[0.98]"
                  >
                    {sendingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Send className="h-3.5 w-3.5" />
                        Generate Secure Code
                      </div>
                    )}
                  </Button>
                )}
              </div>

              {/* Code Input Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between px-1">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">
                    Security Passcode
                  </Label>
                  {verificationCodeId && (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 uppercase tracking-wider">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                      Transmission Live
                    </div>
                  )}
                </div>

                <div
                  className="relative w-full cursor-text"
                  onClick={() => {
                    if (!selectedModerator) {
                      showToast('Please select a coordinator first', 'info');
                      return;
                    }
                    if (!verificationCodeId && !codeSent) {
                      showToast('Please generate a secure code first', 'info');
                      return;
                    }
                    verificationInputRef.current?.focus();
                  }}
                >
                  <input
                    ref={verificationInputRef}
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      if (!verificationCodeId && !codeSent) {
                        showToast('Please generate a secure code first', 'info');
                        return;
                      }
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setVerificationCode(value);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 z-10 font-mono text-transparent bg-transparent border-0 appearance-none focus:outline-none"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <div className="flex gap-2.5 w-full justify-between">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex-1 aspect-[1/1.2] rounded-xl border flex items-center justify-center text-2xl font-mono transition-all duration-300",
                          verificationCode[index]
                            ? "border-green-500/40 bg-green-500/5 text-green-400 shadow-[0_0_20px_-5px_rgba(34,197,94,0.3)]"
                            : "border-gray-800 bg-[#0f1118]",
                          !verificationCode[index] && index === verificationCode.length && selectedModerator && (verificationCodeId || codeSent)
                            ? "border-yellow-500/50 ring-1 ring-yellow-500/20 scale-105 z-10"
                            : ""
                        )}
                      >
                        {verificationCode[index] || (
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-700 md:w-2 md:h-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center px-1">
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">
                    AdtU&apos;S INTEGRATED TRANSPORTATION SYSTEM
                  </p>
                  {(verificationCodeId || codeSent) && (
                    <button
                      onClick={handleSendVerificationCode}
                      disabled={sendingCode || (verificationExpiry ? new Date(verificationExpiry) > new Date() : false) || maxCodesReached || codesSentToday >= 3 || !selectedModerator}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors uppercase tracking-wider"
                    >
                      {sendingCode ? "..." : verificationExpiry && new Date(verificationExpiry) > new Date() ?
                        `Retry ${formatCountdown(countdownTime)}` : "Resend"
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-6 bg-[#0d0f16] border-t border-gray-800/50 flex gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowVerificationDialog(false);
                  setVerificationCode('');
                  setSelectedModerator('');
                  setCodeSent(false);
                  setCountdownTime(0);
                  setVerificationExpiry('');
                  setCodesSentToday(0);
                  setMaxCodesReached(false);
                }}
                className="flex-1 h-12 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 font-bold uppercase tracking-widest transition-all rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (verificationCode.length !== 6) return showToast('Enter 6-digit code', 'error');
                  if (!verificationCodeId) return showToast('Send code first', 'error');

                  setVerifyingCode(true);
                  try {
                    const token = await currentUser?.getIdToken();
                    const response = await fetch('/api/applications/verify-code-only', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ codeId: verificationCodeId, code: verificationCode })
                    });
                    const result = await response.json();
                    if (response.ok && result.verified) {
                      setApplicationState('verified');
                      setShowVerificationDialog(false);
                      showToast('Verification successful!', 'success');
                      setVerificationCode(''); setCodeSent(false); setCountdownTime(0); setVerificationExpiry(''); setCodesSentToday(0); setMaxCodesReached(false);
                      const localDraft = localStorage.getItem('applicationDraft');
                      if (localDraft) {
                        const draft = JSON.parse(localDraft);
                        setFormData(draft);
                        if (draft.faculty) setFacultySelected(true);
                      }
                    } else {
                      const errorType = result.errorType;
                      const errorMessage = result.message || 'Invalid code';
                      if (errorType === 'EXPIRED' || errorType === 'MAX_ATTEMPTS' || errorType === 'ALREADY_USED') {
                        setVerificationCode(''); setCodeSent(false); setCountdownTime(0); setVerificationExpiry(''); setVerificationCodeId('');
                        showToast(result.canResend ? `${errorMessage} Resend code.` : errorMessage, 'error');
                      } else {
                        showToast(errorMessage, 'error');
                      }
                    }
                  } catch (e: any) {
                    showToast(e.message || 'Verification failed', 'error');
                  } finally {
                    setVerifyingCode(false);
                  }
                }}
                disabled={!selectedModerator || verificationCode.length !== 6 || verifyingCode}
                className="flex-[1.5] h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold text-xs uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl border-0 active:scale-[0.98]"
              >
                {verifyingCode ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    Submit Code
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Payment Confirmation Dialog */}
        <Dialog open={showDeletePaymentDialog} onOpenChange={setShowDeletePaymentDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Delete Payment Data?
              </DialogTitle>
              <DialogDescription>
                You have active online payment data associated with this form. Resetting now will remove this payment record. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-center gap-2 sm:gap-4 mt-2">
              <Button
                variant="outline"
                onClick={() => setShowDeletePaymentDialog(false)}
                className="w-full sm:w-auto bg-white text-black hover:bg-gray-100 border-gray-300"
              >
                CANCEL
              </Button>
              <Button
                variant="destructive"
                onClick={performFullReset}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Success Dialog */}
        <Dialog open={showSuccessDialog} onOpenChange={(open) => {
          if (!open) {
            router.push('/student');
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-6 w-6" />
                Application Approved!
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Assigned Bus Info:
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Your assigned bus is <span className="font-semibold">{assignedBusInfo?.busNumber}</span> ({assignedBusInfo?.busRegistration})
                </p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Driver Details:
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Your assigned conductor is <span className="font-semibold">{assignedBusInfo?.driverName}</span>
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                  Contact: <span className="font-semibold">{assignedBusInfo?.driverPhone}</span> for any further assistance
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => router.push('/student')}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Wrap with ErrorBoundary to prevent mobile crashes
export default function ApplicationFormPage() {
  return (
    <ErrorBoundary>
      <ApplicationFormContent />
    </ErrorBoundary>
  );
}
