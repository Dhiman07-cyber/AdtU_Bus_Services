"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { uploadImage, uploadImageWithPreset } from "@/lib/upload";
import { Camera, Upload, X } from "lucide-react";

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
  currentImageUrl?: string;
  folder?: string;
  preset?: string;
}

export function ImageUpload({ 
  onUploadComplete, 
  currentImageUrl, 
  folder = 'adtu', 
  preset 
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Create preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Upload to Cloudinary
      let imageUrl: string | null = null;
      
      if (preset) {
        imageUrl = await uploadImageWithPreset(file, preset);
      } else {
        imageUrl = await uploadImage(file, folder);
      }

      if (imageUrl) {
        onUploadComplete(imageUrl);
      } else {
        throw new Error('Failed to upload image');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      setError('Failed to upload image. Please try again.');
      setPreviewUrl(currentImageUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onUploadComplete('');
  };

  return (
    <div className="space-y-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      {previewUrl ? (
        <div className="relative">
          <img 
            src={previewUrl} 
            alt="Preview" 
            className="w-full h-48 object-cover rounded-md border"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={removeImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div 
          className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onClick={triggerFileInput}
        >
          <Camera className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600">
            Click to upload an image
          </p>
          <p className="text-xs text-gray-500">
            PNG, JPG, GIF up to 5MB
          </p>
        </div>
      )}
      
      <div className="flex space-x-2">
        <Button
          type="button"
          variant="outline"
          onClick={triggerFileInput}
          disabled={uploading}
          className="flex-1"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {previewUrl ? 'Change Image' : 'Upload Image'}
            </>
          )}
        </Button>
      </div>
      
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}