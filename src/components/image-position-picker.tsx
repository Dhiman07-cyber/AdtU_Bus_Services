"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImagePositionPickerProps {
  previewUrl: string | null;
  previewPosition?: { x: number; y: number; scale: number };
  onImageConfirm: (file: File, position: { x: number; y: number; scale: number }) => void;
  onRemove: () => void;
  className?: string;
}

export default function ImagePositionPicker({
  previewUrl,
  previewPosition = { x: 0, y: 0, scale: 1 },
  onImageConfirm,
  onRemove,
  className = ''
}: ImagePositionPickerProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const [isMobile, setIsMobile] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [startScale, setStartScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const modalWrapperRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Check if component is mounted and handle resize
  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Lock body scroll when modal opens
  useEffect(() => {
    if (showModal) {
      // Simple overflow hidden to prevent scrolling
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // ESC key to close modal
      const handleEscKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancelClick();
        }
      };
      window.addEventListener('keydown', handleEscKey);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showModal]);

  // Prevent default wheel behavior (page scroll) effectively
  useEffect(() => {
    const container = modalContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Logic moved to React handler, but this prevents browser native scroll
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [showModal, tempImageUrl]); // Re-bind when modal opens

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      try {
        // Validate file size (max 5MB to prevent memory issues)
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_SIZE) {
          alert('Image too large! Please use an image smaller than 5MB.');
          e.target.value = '';
          return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
          alert('Please select a valid image file.');
          e.target.value = '';
          return;
        }

        setTempFile(file);

        // Create preview URL for modal with compression
        const reader = new FileReader();
        reader.onerror = () => {
          console.error('Error reading file');
          alert('Failed to read image. Please try again.');
        };

        reader.onload = () => {
          const img = new Image();

          img.onerror = () => {
            console.error('Error loading image');
            alert('Failed to load image. Please try a different image.');
          };

          img.onload = () => {
            try {
              // Check image dimensions (max 4000x4000 to prevent memory issues)
              const MAX_DIMENSION = 4000;
              if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
                alert(`Image dimensions too large! Maximum size is ${MAX_DIMENSION}x${MAX_DIMENSION}px.`);
                e.target.value = '';
                return;
              }

              // Calculate initial scale to fill the circle
              const imgAspect = img.width / img.height;
              let initialScale = 1.4; // Default zoom to fill nicely

              // For very wide or very tall images, adjust scale
              if (imgAspect > 2) {
                initialScale = 1.6; // Wide landscape
              } else if (imgAspect < 0.5) {
                initialScale = 1.6; // Tall portrait
              }

              setTempImageUrl(reader.result as string);
              setShowModal(true);
              setPosition({ x: 0, y: 0, scale: initialScale });
            } catch (error) {
              console.error('Error processing image:', error);
              alert('Failed to process image. Please try again.');
            }
          };

          img.src = reader.result as string;
        };

        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error handling file:', error);
        alert('Failed to upload image. Please try again.');
      }
    }
    // Reset file input
    e.target.value = '';
  };

  const handleModalMouseDown = (e: React.MouseEvent) => {
    if (!tempImageUrl) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleModalMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !tempImageUrl) return;
    e.preventDefault();

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    setPosition({ ...position, x: newX, y: newY });
  };

  const handleModalMouseUp = () => {
    setIsDragging(false);
  };

  // Helper to get distance between two touch points
  const getTouchDist = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleModalTouchStart = (e: React.TouchEvent) => {
    if (!tempImageUrl) return;
    // Don't prevent default blindly, might interfere with browser gestures if not handled carefully
    // But here we want to capture interaction

    if (e.touches.length === 2) {
      // Start pinch
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      setPinchStartDist(dist);
      setStartScale(position.scale);
      setIsDragging(false); // Stop dragging when pinching
    } else if (e.touches.length === 1) {
      // Start drag
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y
      });
    }
  };

  const handleModalTouchMove = (e: React.TouchEvent) => {
    if (!tempImageUrl) return;
    e.preventDefault(); // Prevent scrolling while interacting

    if (e.touches.length === 2 && pinchStartDist !== null) {
      // Handle pinch zoom
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const scaleChange = dist / pinchStartDist;
      const newScale = Math.min(Math.max(0.5, startScale * scaleChange), 4);
      setPosition(prev => ({ ...prev, scale: newScale }));
    } else if (e.touches.length === 1 && isDragging) {
      // Handle drag
      const touch = e.touches[0];
      const newX = touch.clientX - dragStart.x;
      const newY = touch.clientY - dragStart.y;
      setPosition(prev => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handleModalTouchEnd = () => {
    setIsDragging(false);
    setPinchStartDist(null);
  };

  const [isCropping, setIsCropping] = useState(false);

  const getCroppedFile = async (
    imageSrc: string,
    pixelCrop: { x: number; y: number; scale: number },
    fileName: string
  ): Promise<File> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      // Allow cross-origin if needed, though these are usually local blobs
      image.crossOrigin = 'anonymous';
      image.src = imageSrc;

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Output size for profile photo (512x512 is plenty for a circular avatar)
          const size = 512;
          canvas.width = size;
          canvas.height = size;

          // Modal container size (h-64/w-64 = 256px)
          const modalContainerSize = 256;
          const outputToModalScale = size / modalContainerSize;

          // 1. Calculate base size matching 'object-cover' in a square container
          const imgAspect = image.width / image.height;
          let drawWidth, drawHeight;

          if (imgAspect > 1) { // Landscape
            drawHeight = size;
            drawWidth = size * imgAspect;
          } else { // Portrait
            drawWidth = size;
            drawHeight = size / imgAspect;
          }

          // 2. Apply user transformations (zoom and pan)
          const finalScale = pixelCrop.scale;
          const finalDrawWidth = drawWidth * finalScale;
          const finalDrawHeight = drawHeight * finalScale;

          // Panning coordinates (scaled from modal UI to canvas pixel size)
          const finalX = pixelCrop.x * outputToModalScale;
          const finalY = pixelCrop.y * outputToModalScale;

          // 3. Draw to canvas
          // We translate to center, apply pan, then draw image centered
          ctx.fillStyle = 'white'; // White background for transparent PNGs
          ctx.fillRect(0, 0, size, size);

          ctx.save();
          ctx.translate(size / 2 + finalX, size / 2 + finalY);
          ctx.drawImage(
            image,
            -finalDrawWidth / 2,
            -finalDrawHeight / 2,
            finalDrawWidth,
            finalDrawHeight
          );
          ctx.restore();

          // 4. Convert to Blob then File
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            const file = new File([blob], fileName.replace(/\.[^/.]+$/, "") + "_cropped.jpg", {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(file);
          }, 'image/jpeg', 0.9);
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = () => reject(new Error('Failed to load image for cropping'));
    });
  };

  const handleOkClick = async () => {
    if (tempFile && tempImageUrl) {
      setIsCropping(true);
      try {
        const croppedFile = await getCroppedFile(tempImageUrl, position, tempFile.name);

        // Notify parent with the ALREADY CROPPED file
        // We pass a reset position because the transformation is now "baked into" the file
        onImageConfirm(croppedFile, { x: 0, y: 0, scale: 1 });

        setShowModal(false);
        setTempImageUrl(null);
        setTempFile(null);
        setPosition({ x: 0, y: 0, scale: 1.4 });
      } catch (error) {
        console.error('Error cropping image:', error);
        alert('Failed to crop image. Please try again.');
      } finally {
        setIsCropping(false);
      }
    }
  };

  const handleCancelClick = () => {
    if (isCropping) return;
    setShowModal(false);
    setTempImageUrl(null);
    setTempFile(null);
    setPosition({ x: 0, y: 0, scale: 1.4 });
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (isCropping) return;
    // Close modal if clicking on the overlay (not the modal content)
    if (e.target === e.currentTarget) {
      handleCancelClick();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // React's event handler - mostly for logic, preventDefault is also called in useEffect
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY * -0.002; // Faster zoom response
    const newScale = Math.min(Math.max(0.5, position.scale + delta), 4); // Extend max to 4x
    setPosition(prev => ({ ...prev, scale: newScale }));
  };

  const handleZoomSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    setPosition(prev => ({ ...prev, scale: newScale }));
  };

  const handleGridClick = () => {
    if (!previewUrl) {
      fileInputRef.current?.click();
    }
  };

  const handleChangePhoto = () => {
    fileInputRef.current?.click();
  };

  // Scale position from modal (256px) to preview grid (64px for mobile, 80px for desktop)
  const modalSize = 256; // h-64 = 16rem = 256px
  const gridSize = isMobile ? 64 : 80; // h-16 = 64px, h-20 = 80px
  const scaleFactor = gridSize / modalSize;
  const scaledPosition = {
    x: previewPosition.x * scaleFactor,
    y: previewPosition.y * scaleFactor,
    scale: previewPosition.scale
  };

  return (
    <>
      <div className={`flex flex-col items-center ${className}`}>
        {/* Circular Preview Container */}
        <div
          className="relative cursor-pointer group"
          onClick={handleGridClick}
        >
          {previewUrl ? (
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-full overflow-hidden border-2 border-gray-300 dark:border-gray-600 shadow-md">
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${scaledPosition.x}px, ${scaledPosition.y}px)`,
                }}
              >
                <img
                  src={previewUrl}
                  //@ts-ignore
                  alt="Profile Preview"
                  className="pointer-events-none select-none w-full h-full object-cover"
                  style={{
                    transform: `scale(${scaledPosition.scale})`,
                  }}
                  draggable={false}
                />
              </div>
            </div>
          ) : (
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 border-gray-300 dark:border-gray-700 shadow-inner">
              <span className="text-gray-400 dark:text-gray-500 text-2xl sm:text-3xl">👤</span>
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
            <Camera className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Remove Photo Button */}
        {previewUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="mt-2 text-sm text-red-500 hover:text-red-700"
          >
            Remove Photo
          </button>
        )}

        {/* Instructions */}
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1.5 sm:mt-2">Click to upload profile photo</p>
      </div>

      {/* Position Adjustment Modal - Rendered via Portal */}
      {mounted && showModal && tempImageUrl && createPortal(
        <div
          ref={modalWrapperRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          tabIndex={-1}
          style={{ margin: 0, padding: '1rem' }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]"
            style={{ animation: 'fadeInZoom 0.2s ease-out' }}
          >
            {/* Modal Header */}
            <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Position Your Photo
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Drag to reposition • Use slider to zoom
              </p>
            </div>

            {/* Image Positioning Area */}
            <div className="p-5 flex flex-col items-center flex-grow overflow-y-auto">
              <div
                ref={modalContainerRef}
                className={`relative h-64 w-64 rounded-full overflow-hidden border-4 border-blue-500 dark:border-blue-400 flex-shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                onMouseDown={handleModalMouseDown}
                onMouseMove={handleModalMouseMove}
                onMouseUp={handleModalMouseUp}
                onMouseLeave={handleModalMouseUp}
                onTouchStart={handleModalTouchStart}
                onTouchMove={handleModalTouchMove}
                onTouchEnd={handleModalTouchEnd}
                onWheel={handleWheel}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                  }}
                >
                  <img
                    src={tempImageUrl}
                    //@ts-ignore
                    alt="Position Preview"
                    className="pointer-events-none select-none w-full h-full object-cover"
                    style={{
                      transform: `scale(${position.scale})`,
                    }}
                    draggable={false}
                  />
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="mt-6 w-full max-w-[260px] space-y-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>-</span>
                  <span>Zoom</span>
                  <span>+</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={position.scale}
                  onChange={handleZoomSliderChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelClick}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleOkClick}
                disabled={isCropping}
                className="bg-blue-500 hover:bg-blue-600 text-white min-w-[100px]"
              >
                {isCropping ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Cropping...</span>
                  </div>
                ) : (
                  'Okay'
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Add keyframe animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInZoom {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  if (!document.head.querySelector('style[data-image-picker]')) {
    style.setAttribute('data-image-picker', 'true');
    document.head.appendChild(style);
  }
}
