/**
 * QR Code Card Component - Example Integration with Token Cleanup
 * 
 * This example shows how to integrate the useTokenCleanup hook
 * to automatically cleanup expired tokens and related documents
 */

import React, { useState, useEffect } from 'react';
import { useTokenCleanup } from '@/hooks/useTokenCleanup';

interface QRCodeCardProps {
  studentUid: string;
  onClose: () => void;
}

export function QRCodeCardExample({ studentUid, onClose }: QRCodeCardProps) {
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(45);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Setup automatic token cleanup
  const { cleanupNow, cancelCleanup, hasCleanedUp } = useTokenCleanup({
    tokenId,
    expiryMs: 45000, // 45 seconds
    autoCleanup: true,
    onCleanupSuccess: () => {
      console.log('✅ Token cleanup completed');
      console.log('Token expired and cleaned up');
    },
    onCleanupError: (error) => {
      console.error('❌ Cleanup error:', error);
      console.error('Failed to cleanup token');
    }
  });

  /**
   * Generate QR code/token
   */
  const generateToken = async () => {
    try {
      // Your existing token generation logic
      const response = await fetch('/api/token/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUid })
      });

      const data = await response.json();
      
      if (data.success) {
        setTokenId(data.tokenId);
        setQrCode(data.qrCode);
        console.log('QR code generated');
      }
    } catch (error) {
      console.error('Token generation error:', error);
      console.error('Failed to generate token');
    }
  };

  /**
   * Countdown timer
   */
  useEffect(() => {
    if (!tokenId) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setIsExpired(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tokenId]);

  /**
   * Handle card close
   */
  const handleClose = () => {
    // Cleanup will be triggered automatically by useTokenCleanup
    // via the unmount effect, but we can also trigger it explicitly
    if (tokenId && !hasCleanedUp && !isExpired) {
      cleanupNow('closed');
    }
    onClose();
  };

  /**
   * Handle manual cancel
   */
  const handleCancel = () => {
    if (tokenId && !hasCleanedUp) {
      cleanupNow('cancelled');
      console.log('Token cancelled and cleaned up');
    }
    onClose();
  };

  /**
   * After successful scan (called from scan verification)
   */
  const handleSuccessfulScan = () => {
    // Cancel automatic cleanup since token was used
    cancelCleanup();
    
    // Trigger different cleanup (keeps boarding action, deletes token/scans)
    cleanupNow('scanned');
    console.log('Boarding successful!');
    
    // Close card after short delay
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="qr-code-card">
      {/* Header */}
      <div className="card-header">
        <h3>Bus Pass QR Code</h3>
        <button onClick={handleClose} className="close-btn">
          ✕
        </button>
      </div>

      {/* QR Code Display */}
      <div className="qr-code-container">
        {!tokenId ? (
          <button onClick={generateToken} className="generate-btn">
            Generate QR Code
          </button>
        ) : (
          <>
            {qrCode && (
              <img 
                src={qrCode} 
                alt="QR Code" 
                className={isExpired ? 'expired' : ''}
              />
            )}
            
            {/* Timer Display */}
            <div className={`timer ${isExpired ? 'expired' : ''}`}>
              {isExpired ? (
                <span className="expired-text">
                  ⏰ Expired - Cleaned up automatically
                </span>
              ) : (
                <span>
                  ⏱️ Expires in: <strong>{timeRemaining}s</strong>
                </span>
              )}
            </div>

            {/* Token Info */}
            <div className="token-info">
              <small>Token ID: {tokenId.slice(0, 8)}...</small>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="card-actions">
        {tokenId && !isExpired && (
          <button onClick={handleCancel} className="cancel-btn">
            Cancel & Cleanup
          </button>
        )}
        {isExpired && (
          <button onClick={handleClose} className="close-btn-primary">
            Close
          </button>
        )}
      </div>

      {/* Cleanup Status */}
      {hasCleanedUp && (
        <div className="cleanup-status">
          ✅ Token and related data cleaned up
        </div>
      )}
    </div>
  );
}

export default QRCodeCardExample;
