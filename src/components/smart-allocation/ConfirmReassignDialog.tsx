'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Users, Bus, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReassignmentPlan } from '@/app/admin/smart-allocation/page';

interface ConfirmReassignDialogProps {
  plans: ReassignmentPlan[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  processing?: boolean;
}

export default function ConfirmReassignDialog({
  plans,
  isOpen,
  onClose,
  onConfirm,
  processing = false
}: ConfirmReassignDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  // Group plans by target bus
  const groupedPlans = plans.reduce((acc, plan) => {
    if (!acc[plan.toBusId]) {
      acc[plan.toBusId] = {
        busNumber: plan.toBusNumber,
        students: []
      };
    }
    acc[plan.toBusId].students.push(plan);
    return acc;
  }, {} as Record<string, { busNumber: string; students: ReassignmentPlan[] }>);

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('Please provide a reason for reassignment');
      return;
    }
    
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters');
      return;
    }

    onConfirm(reason.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Confirm Reassignment
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Review the reassignment plan and provide a mandatory reason for audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          {/* Summary */}
          <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-gray-100">
                  Reassignment Summary
                </span>
              </div>
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                {plans.length} student{plans.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <p className="text-xs text-gray-400">
              Moving students to {Object.keys(groupedPlans).length} different bus{Object.keys(groupedPlans).length !== 1 ? 'es' : ''}
            </p>
          </div>

          {/* Detailed Plan */}
          <ScrollArea className="h-48 rounded-lg border border-zinc-800 p-4">
            {Object.entries(groupedPlans).map(([busId, group]) => (
              <div key={busId} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Bus className="w-4 h-4 text-green-400" />
                  <span className="font-semibold text-gray-100">
                    To {group.busNumber}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                <div className="ml-6 space-y-1">
                  {group.students.map((plan) => (
                    <div key={plan.studentId} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-300">{plan.studentName}</span>
                      <span className="text-gray-500">•</span>
                      <span className="text-gray-400 text-xs">Stop {plan.stopId}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ScrollArea>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-gray-300">
              Reason for Reassignment <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder="Explain why these students are being reassigned (e.g., bus overload, route optimization, stop consolidation)"
              className={cn(
                "min-h-[80px] bg-zinc-900 border-zinc-800",
                error && "border-red-500"
              )}
              disabled={processing}
            />
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Warnings */}
          <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm text-amber-300 font-semibold">Important Notes:</p>
                <ul className="text-xs text-amber-400/80 space-y-0.5">
                  <li>• Notifications will be sent to affected students and drivers</li>
                  <li>• This action will be logged for audit purposes</li>
                  <li>• You have 5 minutes to undo this action after confirmation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={processing}
            className="border-zinc-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={processing || !reason.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                Confirm Reassignment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
