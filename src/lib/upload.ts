// Client-side upload function that uses the API route
export const uploadImage = async (file: File, folder: string = 'adtu'): Promise<string | null> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
};

export const uploadImageWithPreset = async (file: File, preset: string): Promise<string | null> => {
  // For client-side uploads with presets, we would need a separate API route
  // For now, we'll just use the regular upload function
  return uploadImage(file, 'adtu');
};