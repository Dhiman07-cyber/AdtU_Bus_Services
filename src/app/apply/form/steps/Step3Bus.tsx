import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BusStepProps } from './types';
import RouteSelectionSection from '@/components/RouteSelectionSection';

export default function Step3Bus({
  formData,
  handleInputChange,
  onNext,
  onPrev,
  routes,
  buses,
  setCapacityCheckResult,
  handleRefChange,
  applicationState
}: BusStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white mb-1">Bus Details</h2>
        <p className="text-sm text-slate-400">Select your preferred route, stop, and bus shift.</p>
      </div>

      <div className="pt-2">
        <RouteSelectionSection
          routes={routes}
          buses={buses}
          selectedRouteId={formData.routeId || ''}
          selectedBusId={formData.busId || ''}
          selectedStopId={formData.stopId || ''}
          selectedShift={formData.shift}
          onReferenceChange={handleRefChange}
          onCapacityCheckResult={setCapacityCheckResult}
          isReadOnly={applicationState === 'submitted'}
          shiftContent={
            <div className="space-y-1">
              <Label htmlFor="shift" className="block text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-2">
                Shift Selection <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.shift}
                onValueChange={(value) => {
                  handleInputChange('shift', value);
                  handleInputChange('routeId', '');
                  handleInputChange('busId', '');
                  handleInputChange('stopId', '');
                  handleInputChange('busAssigned', '');
                }}
              >
                <SelectTrigger className="h-10 bg-transparent border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-xs text-slate-200">
                  <SelectValue placeholder="Select Shift" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="Morning">Morning Shift</SelectItem>
                  <SelectItem value="Evening">Evening Shift</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
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
