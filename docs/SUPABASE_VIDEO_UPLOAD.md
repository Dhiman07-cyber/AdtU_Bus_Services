# Supabase Storage Video Upload Guide

## Video File to Upload
- **Source**: `public/landing_video/Welcome_Final.mp4`
- **Size**: ~429 MB
- **Destination**: Supabase Storage bucket `adtu_bus_assets` → folder `landing_video`

## Method 1: Supabase Dashboard (Recommended for large files)

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Select your project**: `ztqilqooygdqpmhnxidi`
3. **Navigate to Storage**: Left sidebar → "Storage"
4. **Open bucket**: Click on `adtu_bus_assets` bucket
5. **Create folder** (if needed): Create a folder named `landing_video`
6. **Upload file**: 
   - Click "Upload files" button
   - Select `Welcome_Final.mp4` from `public/landing_video/`
   - Wait for upload to complete

### Expected Public URL
After upload, the video will be accessible at:
```
https://ztqilqooygdqpmhnxidi.supabase.co/storage/v1/object/public/adtu_bus_assets/landing_video/Welcome_Final.mp4
```

## Method 2: Using Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
npx supabase login

# Upload the file
npx supabase storage upload adtu_bus_assets/landing_video/Welcome_Final.mp4 ./public/landing_video/Welcome_Final.mp4 --project-ref ztqilqooygdqpmhnxidi
```

## Bucket Permissions

Make sure the `adtu_bus_assets` bucket has public access enabled for reading:

1. Go to Storage → `adtu_bus_assets` → Settings
2. Ensure "Public bucket" is enabled OR
3. Add this RLS policy for public read access:

```sql
-- Allow public read access to landing_video folder
CREATE POLICY "Allow public read landing_video" ON storage.objects
FOR SELECT USING (
  bucket_id = 'adtu_bus_assets' AND 
  (storage.foldername(name))[1] = 'landing_video'
);
```

## Testing

After upload, test the video URL by opening in browser:
```
https://ztqilqooygdqpmhnxidi.supabase.co/storage/v1/object/public/adtu_bus_assets/landing_video/Welcome_Final.mp4
```

## Fallback Behavior

The implementation includes automatic fallback:
- If Supabase video fails to load → Falls back to local `/landing_video/Welcome_Final.mp4`
- The local file in `public/landing_video/` serves as a backup
