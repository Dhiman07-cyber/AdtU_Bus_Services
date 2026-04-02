import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OptimizedInput } from '@/components/forms/OptimizedInput';
import FacultyDepartmentSelector from '@/components/faculty-department-selector';
import { AcademicStepProps } from './types';

export default function Step2Academic({
  formData,
  handleInputChange,
  onNext,
  onPrev,
  handleFacultySelect,
  handleDepartmentSelect
}: AcademicStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white mb-1">Academic Information</h2>
        <p className="text-sm text-slate-400">Please provide your current course and enrollment details.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-2">
        <div className="md:col-span-2">
          <FacultyDepartmentSelector
            onFacultySelect={handleFacultySelect}
            onDepartmentSelect={handleDepartmentSelect}
            initialFaculty={formData.faculty}
            initialDepartment={formData.department}
          />
        </div>

        <div>
          <Label htmlFor="semester" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2">
            Semester <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.semester}
            onValueChange={(value) => handleInputChange('semester', value)}
          >
            <SelectTrigger className="h-10 bg-transparent border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-xs">
              <SelectValue placeholder="Select Semester" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              {['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester'].map((sem) => (
                <SelectItem key={sem} value={sem}>{sem}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <OptimizedInput
          id="enrollmentId"
          label="Enrollment ID"
          value={formData.enrollmentId}
          onChange={(value) => handleInputChange('enrollmentId', value)}
          placeholder="Enter enrollment ID"
          required
          className="h-10 text-xs"
          labelClassName="text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2"
        />
      </div>

      <div className="pt-6 border-t border-slate-800 flex justify-between">
        <Button onClick={onPrev} variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800 h-10 px-6 font-bold transition-all">
          &lt;- Back to previous step
        </Button>
        <Button onClick={onNext} className="bg-white hover:bg-slate-200 text-black font-bold h-10 px-8 rounded-full shadow-lg transition-all hover:scale-105">
          Continue -&gt;
        </Button>
      </div>
    </div>
  );
}
