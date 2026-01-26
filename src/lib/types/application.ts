/**
 * Application System Types
 * Defines the complete bus service application workflow
 */

// Application States (State Machine)
export type ApplicationState =
  | 'noDoc'                  // User logged in but no user doc found
  | 'draft'                  // User started/saved application
  | 'awaiting_verification'  // Verification code sent to moderator
  | 'verified'               // Moderator verified & student entered correct code
  | 'submitted'              // Application submitted to admin queue
  | 'approved'               // Admin/moderator approved
  | 'rejected'               // Admin/moderator rejected
  | 'cancelled'              // User cancelled
  | 'expired';               // Application expired

// Payment Modes
export type PaymentMode = 'offline' | 'upi' | 'bank' | 'card';

// Payment Information
export interface PaymentInfo {
  paymentMode: PaymentMode | 'online';
  amountPaid: number; // Total amount paid for the selected duration

  // Offline Payment Fields (only for offline payments)
  paymentReference?: string; // UPI Transaction ID / Payment Reference (offline only)
  paymentEvidenceUrl?: string; // Receipt image URL (offline only)
  paymentEvidenceProvided: boolean; // True if receipt uploaded

  // Online Payment Transaction Details (Razorpay - only for online payments)
  razorpayPaymentId?: string; // Razorpay payment ID
  razorpayOrderId?: string; // Razorpay order ID
  paymentStatus?: string; // 'success' | 'failed' | 'pending' (online only)
  paymentMethod?: string; // 'card' | 'upi' | 'netbanking' (online only)
  paymentTime?: string; // ISO timestamp (online only)
}

// Session Information
export interface SessionInfo {
  sessionStartYear: number;
  durationYears: number;
  sessionEndYear: number;
  validUntil?: string; // ISO timestamp
  feeEstimate: number;
}

// Audit Log Entry
export interface AuditLogEntry {
  actorId: string;
  actorRole: 'student' | 'moderator' | 'admin' | 'system';
  action: string;
  timestamp: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// Application Form Data
export interface ApplicationFormData {
  // Personal Info
  fullName: string;
  email: string;
  phoneNumber: string;
  alternatePhone?: string;
  enrollmentId: string;
  gender: string;
  dob: string;
  age: string;
  profilePhotoUrl?: string;

  // Academic Info
  faculty: string;
  department: string;
  semester: string;

  // Contact Info
  address: string;
  parentName: string;
  parentPhone: string;

  // Medical Info
  bloodGroup: string;

  // Service Selection
  routeId?: string;
  busId?: string;
  busAssigned?: string;
  stopId?: string;
  shift?: string;

  // Session & Payment
  sessionInfo: SessionInfo;
  paymentInfo: PaymentInfo;

  // Declarations
  declarationAccepted: boolean;
  understandsVerification: boolean;
}

// Verification Code Metadata
// Verification Code Metadata
export interface VerificationCode {
  codeId: string;
  applicationId: string | null;
  studentUid: string;
  moderatorUid: string;
  moderatorName: string; // {Name} {EMPID}
  codeHash: string; // Never store plain code (legacy) - kept for security
  code?: string; // Plain text code for moderator display (required by UI now)
  codeLength: number;
  generatedAt: string;
  expiresAt: string;
  used: boolean;
  usedAt?: string;
  attempts: number;
  maxAttempts: number;

  // Essential Display Data (Flattened)
  studentName: string;
  enrollmentId: string;
  amount: number;
  paymentMode: string;
  paymentReference?: string;
  shift: string;
}

// Moderator Profile
export interface ModeratorProfile {
  moderatorUid: string;
  name: string;
  empId: string;
  email: string;
  role: 'moderator';
  assignedOffice?: string;
  active: boolean;
  createdAt: string;
}

// Application Document (Firestore)
export interface Application {
  // Identity
  applicationId: string;
  applicantUid: string;
  applicantEmail?: string; // Legacy field
  email?: string;          // New standardized field

  // Form Data
  formData: ApplicationFormData;

  // State & Flow
  state: ApplicationState;
  stateHistory?: Array<{ state: ApplicationState; timestamp: string; actor?: string }>;

  // Verification
  pendingVerifier?: string; // {Name} {EMPID}
  verificationAttempts: number;
  verifiedAt?: string;
  verifiedBy?: string; // {Name} {EMPID}
  verifiedById?: string; // moderatorUid for audit

  // Submission
  submittedAt?: string;
  submittedBy?: string;

  // Approval/Rejection
  approvedAt?: string;
  approvedBy?: string; // {Name} {EMPID} - REQUIRED field
  approvedById?: string; // admin/moderator uid for audit

  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;

  // Audit
  auditLogs: AuditLogEntry[];

  // Version
  applicationVersion?: number;

  // Capacity/Reassignment Review Fields
  // When bus is overloaded, these fields indicate the student needs reassignment
  needsCapacityReview?: boolean;
  /**
   * Reassignment reason codes:
   * - 'bus_full_only_option': The selected bus is full and only serves the stop (Case 1)
   * - 'bus_full_alternatives_exist': The selected bus is full but other buses also serve it (Case 2)
   * - 'no_issue': The selected bus has seats available (Case 3 - no action needed)
   */
  reassignmentReason?: 'bus_full_only_option' | 'bus_full_alternatives_exist' | 'no_issue';
  hasAlternativeBuses?: boolean;
}

// Student User Profile (post-approval)
export interface StudentUser {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  enrollmentId: string;
  department: string;
  semester: string;
  role: 'student';

  // Session Info
  sessionStartYear: number;
  durationYears: number;
  sessionEndYear: number;
  validUntil: string;
  status: 'active' | 'expired' | 'suspended';

  // Approval Info
  approvedBy: string; // {Name} {EMPID} - REQUIRED
  verifiedById: string;

  // Payment
  paymentInfo: PaymentInfo;

  // History
  sessionHistory?: Array<{
    start: number;
    end: number;
    approvedBy: string;
    approvedAt: string;
  }>;

  // Metadata
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
}

// Notification Types for Application Flow
export type ApplicationNotificationType =
  | 'VerificationRequested'
  | 'CodeSent'
  | 'VerificationSuccess'
  | 'Submitted'
  | 'Approved'
  | 'ExpiryReminder'
  | 'RemindersForPending';

// Application Notification
export interface ApplicationNotification {
  notifId: string;
  toUid: string;
  toRole: 'student' | 'moderator' | 'admin';
  type: ApplicationNotificationType;
  title: string;
  body: string;
  links?: {
    applicationId?: string;
    profile?: string;
    renewPage?: string;
  };
  read: boolean;
  createdAt: string;
}

// API Request/Response Types
export interface GenerateCodeRequest {
  applicationId: string;
  moderatorUid: string;
  moderatorName: string;
}

export interface GenerateCodeResponse {
  success: boolean;
  codeId: string;
  expiresAt: string;
  message: string;
}

export interface VerifyCodeRequest {
  applicationId: string;
  code: string;
}

export interface VerifyCodeResponse {
  success: boolean;
  message: string;
  verified: boolean;
}

export interface SubmitApplicationRequest {
  applicationId: string;
}

export interface SubmitApplicationResponse {
  success: boolean;
  message: string;
  applicationId: string;
}

export interface ApproveApplicationRequest {
  applicationId: string;
  approverName: string; // {Name} {EMPID}
  approverId: string;
  notes?: string;
}

export interface RejectApplicationRequest {
  applicationId: string;
  rejectorName: string;
  rejectorId: string;
}

