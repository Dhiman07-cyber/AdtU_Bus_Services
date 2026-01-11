"use client";

import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User, Mail, Phone, Calendar, Hash, Users, Building, QrCode,
  Route, IndianRupee, Clock, Shield, Briefcase, GraduationCap,
  Heart, Home, Sparkles, MapPin, Bus, CheckCircle
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import StudentQRDisplay from "@/components/bus-pass/StudentQRDisplay";
import { useRealtimeDocument } from "@/hooks/useRealtimeDocument";
// SPARK PLAN SAFETY: Migrated to usePaginatedCollection
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';
import Image from "next/image";

const formatDate = (dateString: string | any) => {
  if (!dateString) return 'Not Set';
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString.toDate ? dateString.toDate() : new Date(dateString);
    return isNaN(date.getTime()) ? 'Not Set' : date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return 'Not Set';
  }
};

export default function PremiumStudentProfile() {
  const { userData, currentUser } = useAuth();
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);

  const { data: student, loading } = useRealtimeDocument<any>({
    collectionName: 'students',
    documentId: currentUser?.uid || null,
    enabled: !!currentUser?.uid
  });

  const { data: buses, refresh: refreshBuses } = usePaginatedCollection('buses', {
    pageSize: 50, orderByField: 'busNumber', orderDirection: 'asc', autoRefresh: false,
  });
  const { data: routes, refresh: refreshRoutes } = usePaginatedCollection('routes', {
    pageSize: 50, orderByField: 'routeName', orderDirection: 'asc', autoRefresh: false,
  });

  const busData = useMemo(() => {
    if (!student || !buses.length) return null;
    const busId = student.busId || student.assignedBusId;
    return busId ? buses.find((b: any) => b.busId === busId || b.id === busId) : null;
  }, [student, buses]);

  const routeData = useMemo(() => {
    if (!student || !routes.length) return null;
    const routeId = student.routeId || student.assignedRouteId;
    return routeId ? routes.find((r: any) => r.routeId === routeId || r.id === routeId) : null;
  }, [student, routes]);

  useEffect(() => {
    if (userData && userData.role !== "student") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
              <Sparkles className="h-10 w-10 text-blue-600" />
              My Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Complete student information and bus pass details</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setShowQRModal(true)} className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg">
              <QrCode className="h-4 w-4 mr-2" />
              Generate Bus Pass
            </Button>
            <Button onClick={() => router.push('/student')} variant="outline">
              Back to Dashboard
            </Button>
          </div>
        </div>

        {/* Profile Header Card */}
        <Card className="border-2 border-blue-200 dark:border-blue-800 shadow-2xl overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600"></div>
          <CardContent className="pt-0">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 -mt-16 md:-mt-20">
              <div className="relative">
                {student?.profilePhotoUrl || student?.profilePicture ? (
                  <div className="h-32 w-32 md:h-40 md:w-40 rounded-full border-4 border-white dark:border-gray-900 overflow-hidden shadow-2xl bg-white">
                    <Image
                      src={student.profilePhotoUrl || student.profilePicture}
                      alt={student?.fullName || 'Student'}
                      width={160}
                      height={160}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="h-32 w-32 md:h-40 md:w-40 rounded-full border-4 border-white dark:border-gray-900 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl">
                    <User className="h-16 w-16 md:h-20 md:w-20 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-green-500 h-8 w-8 rounded-full border-4 border-white dark:border-gray-900 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              </div>

              <div className="flex-1 text-center md:text-left mb-4">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{student?.fullName || student?.name || 'Student'}</h2>
                <p className="text-gray-600 dark:text-gray-400 text-lg">{student?.enrollmentId || 'No Enrollment ID'}</p>
                <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                  <Badge className={`${student?.status === 'active' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
                    {student?.status || 'Unknown'} Status
                  </Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400">
                    {student?.shift || 'No Shift'}  Shift
                  </Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-700 dark:text-purple-400">
                    {student?.semester || 'N/A'} Semester
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Information Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Personal Information */}
          <Card className="shadow-lg border-l-4 border-l-blue-500">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow icon={<Mail className="h-5 w-5" />} label="Email" value={student?.email || 'N/A'} />
              <InfoRow icon={<Phone className="h-5 w-5" />} label="Phone" value={student?.phoneNumber || student?.phone || 'N/A'} />
              <InfoRow icon={<Phone className="h-5 w-5" />} label="Alternate Phone" value={student?.alternatePhone || 'N/A'} />
              <InfoRow icon={<Calendar className="h-5 w-5" />} label="Date of Birth" value={formatDate(student?.dob)} />
              <InfoRow icon={<Hash className="h-5 w-5" />} label="Age" value={student?.age || 'N/A'} />
              <InfoRow icon={<User className="h-5 w-5" />} label="Gender" value={student?.gender || 'N/A'} />
              <InfoRow icon={<Heart className="h-5 w-5" />} label="Blood Group" value={student?.bloodGroup || 'N/A'} />
              <InfoRow icon={<Home className="h-5 w-5" />} label="Address" value={student?.address || 'N/A'} />
            </CardContent>
          </Card>

          {/* Academic Information */}
          <Card className="shadow-lg border-l-4 border-l-purple-500">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-purple-600" />
                Academic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow icon={<Building className="h-5 w-5" />} label="Faculty" value={student?.faculty || 'N/A'} />
              <InfoRow icon={<Briefcase className="h-5 w-5" />} label="Department" value={student?.department || 'N/A'} />
              <InfoRow icon={<Hash className="h-5 w-5" />} label="Enrollment ID" value={student?.enrollmentId || 'N/A'} />
              <InfoRow icon={<GraduationCap className="h-5 w-5" />} label="Semester" value={student?.semester || 'N/A'} />
              <InfoRow icon={<Calendar className="h-5 w-5" />} label="Session" value={`${student?.sessionStartYear || 'N/A'} - ${student?.sessionEndYear || 'N/A'}`} />
              <InfoRow icon={<Clock className="h-5 w-5" />} label="Duration" value={`${student?.durationYears || 'N/A'} years`} />
              <InfoRow icon={<Users className="h-5 w-5" />} label="Shift" value={student?.shift || 'N/A'} />
            </CardContent>
          </Card>

          {/* Bus & Route Information */}
          <Card className="shadow-lg border-l-4 border-l-green-500">
            <CardHeader className="bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950 dark:to-teal-950">
              <CardTitle className="flex items-center gap-2">
                <Bus className="h-5 w-5 text-green-600" />
                Bus & Route Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow icon={<Bus className="h-5 w-5" />} label="Assigned Bus" value={busData?.busNumber || student?.busId || 'Not Assigned'} />
              <InfoRow icon={<Hash className="h-5 w-5" />} label="Bus ID" value={student?.busId || 'N/A'} />
              <InfoRow icon={<Route className="h-5 w-5" />} label="Route Name" value={routeData?.routeName || 'Not Assigned'} />
              <InfoRow icon={<Hash className="h-5 w-5" />} label="Route ID" value={student?.routeId || 'N/A'} />
              <InfoRow icon={<MapPin className="h-5 w-5" />} label="Stop ID" value={student?.stopId || 'N/A'} />
              {busData && (
                <>
                  <InfoRow icon={<Users className="h-5 w-5" />} label="Bus Capacity" value={busData.capacity || 'N/A'} />
                  <InfoRow icon={<Shield className="h-5 w-5" />} label="Bus Status" value={busData.status || 'N/A'} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment & Session Information */}
          <Card className="shadow-lg border-l-4 border-l-orange-500">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950">
              <CardTitle className="flex items-center gap-2">
                <IndianRupee className="h-5 w-5 text-orange-600" />
                Payment & Session Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow
                icon={<IndianRupee className="h-5 w-5" />}
                label="Amount Paid"
                value={`₹${student?.paymentInfo?.amountPaid || 0}`}
                valueClassName="text-green-600 dark:text-green-400 font-bold text-lg"
              />
              <InfoRow icon={<Hash className="h-5 w-5" />} label="Currency" value={student?.paymentInfo?.currency || 'INR'} />
              <InfoRow icon={<Shield className="h-5 w-5" />} label="Payment Status" value={((student?.paymentInfo?.paymentVerified) || (student?.status === 'active' && student?.paymentInfo?.amountPaid > 0)) ? 'Approved' : 'Pending'} />
              <InfoRow icon={<CheckCircle className="h-5 w-5" />} label="Evidence Provided" value={student?.paymentInfo?.paymentEvidenceProvided ? 'Yes' : 'No'} />
              <InfoRow icon={<Calendar className="h-5 w-5" />} label="Valid Until" value={formatDate(student?.validUntil)} />
              <InfoRow icon={<Clock className="h-5 w-5" />} label="Status" value={student?.status || 'N/A'} />
              <InfoRow icon={<Users className="h-5 w-5" />} label="Approved By" value={student?.approvedBy || 'N/A'} />
              <InfoRow icon={<Calendar className="h-5 w-5" />} label="Approved At" value={formatDate(student?.approvedAt)} />
            </CardContent>
          </Card>

          {/* Family Information */}
          <Card className="shadow-lg border-l-4 border-l-pink-500">
            <CardHeader className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-pink-600" />
                Family Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow icon={<User className="h-5 w-5" />} label="Parent Name" value={student?.parentName || 'N/A'} />
              <InfoRow icon={<Phone className="h-5 w-5" />} label="Parent Phone" value={student?.parentPhone || 'N/A'} />
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card className="shadow-lg border-l-4 border-l-indigo-500">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <InfoRow icon={<Hash className="h-5 w-5" />} label="User ID" value={student?.uid || currentUser?.uid || 'N/A'} />
              <InfoRow icon={<Calendar className="h-5 w-5" />} label="Created At" value={formatDate(student?.createdAt)} />
              <InfoRow icon={<Clock className="h-5 w-5" />} label="Last Updated" value={formatDate(student?.updatedAt)} />
              <InfoRow icon={<User className="h-5 w-5" />} label="Role" value={student?.role || 'student'} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bus Pass QR Modal */}
      <StudentQRDisplay
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        studentUid={currentUser?.uid || ''}
        studentName={student?.fullName || userData?.name || 'Student'}
        enrollmentId={student?.enrollmentId}
        busNumber={busData?.busNumber || student?.busId}
        routeName={routeData?.routeName || student?.routeId}
        validUntil={student?.validUntil}
        isActive={student?.status === 'active'}
      />
    </div>
  );
}

// Helper component for displaying information rows
function InfoRow({ icon, label, value, valueClassName = "text-gray-900 dark:text-white font-medium" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        {icon}
        <span className="text-sm font-medium">{label}:</span>
      </div>
      <span className={`text-sm ${valueClassName}`}>{value}</span>
    </div>
  );
}
