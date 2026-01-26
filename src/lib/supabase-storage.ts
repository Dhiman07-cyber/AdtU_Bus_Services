import { createClient } from '@supabase/supabase-js';

// Environment configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase clients
let supabase: any = null;
let supabaseService: any = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    console.error('❌ Supabase storage client init failed:', error);
  }
}

if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);
  } catch (error) {
    console.error('❌ Supabase storage service client init failed:', error);
  }
}

// Storage bucket name
const BUCKET_NAME = 'adtu_bus_assets';

interface StorageFile {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: any;
}

export class SupabaseStorageService {
  // Public method to check if clients are initialized
  public isClientInitialized(): boolean {
    return !!supabase;
  }

  public isServiceClientInitialized(): boolean {
    return !!supabaseService;
  }

  /**
   * Upload a file to the Supabase Storage bucket
   * @param file - The file to upload
   * @param path - The path where to store the file (e.g., 'bus_photos/bus_123.jpg')
   * @param userId - The user ID (for permission checks)
   * @returns The public URL of the uploaded file or null if failed
   */
  async uploadFile(
    file: File,
    path: string,
    userId?: string
  ): Promise<string | null> {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return null;
      }

      // Upload file to Supabase Storage
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Error uploading file:', error);
        return null;
      }

      // Get public URL for the uploaded file
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return publicUrlData.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  }

  /**
   * Upload a file with automatic path generation
   * @param file - The file to upload
   * @param folder - The folder to store the file in (e.g., 'bus_photos', 'profile_images')
   * @param fileName - Optional custom file name (if not provided, a unique name will be generated)
   * @returns The public URL of the uploaded file or null if failed
   */
  async uploadFileAutoPath(
    file: File,
    folder: string,
    fileName?: string
  ): Promise<string | null> {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return null;
      }

      // Generate unique file name if not provided
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const uniqueFileName = fileName
        ? `${fileName}.${fileExtension}`
        : `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExtension}`;

      const path = `${folder}/${uniqueFileName}`;

      return await this.uploadFile(file, path);
    } catch (error) {
      console.error('Error uploading file with auto path:', error);
      return null;
    }
  }

  /**
   * Get the public URL of a file
   * @param path - The path of the file in the bucket
   * @returns The public URL of the file or null if not found
   */
  getFileUrl(path: string): string | null {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return null;
      }

      const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return data.publicUrl;
    } catch (error) {
      console.error('Error getting file URL:', error);
      return null;
    }
  }

  /**
   * Delete a file from the Supabase Storage bucket
   * @param path - The path of the file to delete
   * @returns True if successful, false otherwise
   */
  async deleteFile(path: string): Promise<boolean> {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return false;
      }

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

      if (error) {
        console.error('Error deleting file:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * List files in a folder
   * @param folderPath - The folder path to list files from
   * @returns Array of file paths or empty array if failed
   */
  async listFiles(folderPath: string): Promise<string[]> {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return [];
      }

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folderPath);

      if (error) {
        console.error('Error listing files:', error);
        return [];
      }

      return data?.map((file: StorageFile) => `${folderPath}/${file.name}`) || [];
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }

  /**
   * Create a signed URL for private files (valid for a limited time)
   * @param path - The path of the file
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   * @returns Signed URL or null if failed
   */
  async createSignedUrl(path: string, expiresIn: number = 3600): Promise<string | null> {
    try {
      if (!supabase) {
        console.error('Supabase client not initialized for storage');
        return null;
      }

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(path, expiresIn);

      if (error) {
        console.error('Error creating signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }
  }
}

// Export singleton instance
export const supabaseStorageService = new SupabaseStorageService();