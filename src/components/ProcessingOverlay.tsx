import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ProcessingOverlayProps {
  message?: string;
}

export default function ProcessingOverlay({ message = "Processing your request... Please wait" }: ProcessingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      data-nextjs-scroll-focus-boundary
    >
      <Card className="p-6 bg-gray-900 border-gray-700">
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div>
            <p className="font-medium">{message}</p>
            <p className="text-sm text-gray-400 mt-1">Do not close this window</p>
          </div>
        </div>
      </Card>
    </div>
  );
}



