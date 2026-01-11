"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser } from "@/lib/user-service";
import { UserRole } from "@/lib/user-service";

interface UserEnrollmentFormProps {
  onUserCreated?: () => void;
}

export default function UserEnrollmentForm({ onUserCreated }: UserEnrollmentFormProps) {
  const [role, setRole] = useState<UserRole>("student");
  const [email, setEmail] = useState("");
  
  const [name, setName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [dob, setDob] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [assignedFaculty, setAssignedFaculty] = useState("");
  const [permissions, setPermissions] = useState("");
  const [busAssigned, setBusAssigned] = useState("");
  const [routeId, setRouteId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // Prepare user data based on role
      let userData: any = {
        role,
        name,
        phoneNumber,
        alternatePhoneNumber,
      };

      // Add role-specific fields
      switch (role) {
        case "student":
          userData = {
            ...userData,
            enrollmentId,
            gender,
            age: parseInt(age) || 0,
            faculty,
            department,
            year,
            parentName,
            parentPhone,
            busAssigned,
            routeId,
            waitingFlag: false,
          };
          break;
        case "driver":
          userData = {
            ...userData,
            dob,
            licenseNumber,
            joiningDate,
            assignedBus: busAssigned,
            routeId,
          };
          break;
        case "moderator":
          userData = {
            ...userData,
            dob,
            assignedFaculty,
            permissions: permissions.split(",").map(p => p.trim()).filter(p => p),
            joiningDate,
          };
          break;
        case "admin":
          // Admin has minimal fields
          break;
      }

      // For Google authentication, we don't need password
      const result = await createUser(email, "", userData, profilePhoto || undefined);
      
      if (result.success) {
        setSuccess(true);
        // Reset form
        setEmail("");
        setPassword("");
        setName("");
        setProfilePhoto(null);
        setPhoneNumber("");
        setAlternatePhoneNumber("");
        setEnrollmentId("");
        setGender("");
        setAge("");
        setFaculty("");
        setDepartment("");
        setYear("");
        setParentName("");
        setParentPhone("");
        setDob("");
        setLicenseNumber("");
        setJoiningDate("");
        setAssignedFaculty("");
        setPermissions("");
        setBusAssigned("");
        setRouteId("");
        
        if (onUserCreated) {
          onUserCreated();
        }
      } else {
        setError(result.error || "Failed to create user");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProfilePhoto(e.target.files[0]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Enrollment</CardTitle>
        <CardDescription>
          Add a new user to the bus service system
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md">
            User created successfully!
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(value: UserRole) => setRole(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            

            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="alternatePhone">Alternate Phone</Label>
              <Input
                id="alternatePhone"
                type="tel"
                value={alternatePhoneNumber}
                onChange={(e) => setAlternatePhoneNumber(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="profilePhoto">Profile Photo</Label>
              <Input
                id="profilePhoto"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          </div>
          
          {/* Role-specific fields */}
          {role === "student" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="enrollmentId">Enrollment ID</Label>
                <Input
                  id="enrollmentId"
                  value={enrollmentId}
                  onChange={(e) => setEnrollmentId(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="faculty">Faculty</Label>
                <Input
                  id="faculty"
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="year">Year/Semester</Label>
                <Input
                  id="year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="parentName">Parent Name</Label>
                <Input
                  id="parentName"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="parentPhone">Parent Phone</Label>
                <Input
                  id="parentPhone"
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="busAssigned">Bus Assigned</Label>
                <Input
                  id="busAssigned"
                  value={busAssigned}
                  onChange={(e) => setBusAssigned(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="routeId">Route ID</Label>
                <Input
                  id="routeId"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                />
              </div>
            </div>
          )}
          
          {(role === "driver" || role === "moderator") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="joiningDate">Joining Date</Label>
                <Input
                  id="joiningDate"
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  required
                />
              </div>
              
              {role === "driver" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License Number</Label>
                    <Input
                      id="licenseNumber"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="busAssigned">Bus Assigned</Label>
                    <Input
                      id="busAssigned"
                      value={busAssigned}
                      onChange={(e) => setBusAssigned(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="routeId">Route ID</Label>
                    <Input
                      id="routeId"
                      value={routeId}
                      onChange={(e) => setRouteId(e.target.value)}
                    />
                  </div>
                </>
              )}
              
              {role === "moderator" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="assignedFaculty">Assigned Faculty</Label>
                    <Input
                      id="assignedFaculty"
                      value={assignedFaculty}
                      onChange={(e) => setAssignedFaculty(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="permissions">Permissions (comma separated)</Label>
                    <Textarea
                      id="permissions"
                      value={permissions}
                      onChange={(e) => setPermissions(e.target.value)}
                      placeholder="enrollStudents, assignRoutes, manageBuses"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </CardContent>
      <CardFooter>
        <Button 
          type="submit" 
          className="w-full" 
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Creating User..." : "Create User"}
        </Button>
      </CardFooter>
    </Card>
  );
}