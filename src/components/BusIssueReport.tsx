"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/contexts/toast-context";
import { useAuth } from "@/contexts/auth-context";
import { Wrench } from "lucide-react";

interface BusIssueReportProps {
  driverUid: string;
  busId: string;
  driverName: string;
}

export function BusIssueReport({ driverUid, busId, driverName }: BusIssueReportProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const { addToast } = useToast();
  const { currentUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!issueTitle.trim() || !issueDescription.trim()) {
      addToast("Please fill in all fields", "error");
      return;
    }
    
    if (!currentUser) {
      addToast("You must be signed in to report an issue", "error");
      return;
    }
    
    setSubmitting(true);
    
    try {
      // Get Firebase ID token
      const token = await currentUser.getIdToken();
      
      // Call the report-bus-issue API endpoint
      const response = await fetch('/api/report-bus-issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: token,
          issueData: {
            busId,
            title: issueTitle,
            description: issueDescription
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        addToast("Issue reported successfully", "success");
        setOpen(false);
        setIssueTitle("");
        setIssueDescription("");
      } else {
        throw new Error(result.error || "Failed to report issue");
      }
    } catch (error: any) {
      console.error("Error reporting issue:", error);
      addToast(error.message || "Failed to report issue", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wrench className="mr-2 h-4 w-4" />
          Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report Bus Issue</DialogTitle>
          <DialogDescription>
            Report any issues with your assigned bus. Our maintenance team will review and address your concern.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issueTitle">Issue Title</Label>
            <Input
              id="issueTitle"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              placeholder="Brief description of the issue"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issueDescription">Description</Label>
            <Textarea
              id="issueDescription"
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Detailed description of the issue..."
              rows={4}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Reporting..." : "Report Issue"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}