/**
 * Utility functions for downloading files
 */

/**
 * Downloads a file from a URL
 * @param url - The URL of the file to download
 * @param filename - The filename to save as (optional)
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    // Determine the final filename
    const fileExtension = url.split('.').pop()?.split('?')[0] || 'file';
    const finalFilename = filename || url.split('/').pop()?.split('?')[0] || `receipt.${fileExtension}`;

    // Construct the proxy URL
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(finalFilename)}`;

    // Create a temporary anchor element pointing to the proxy
    const link = document.createElement('a');
    link.href = proxyUrl;
    link.download = finalFilename; // Hint to browser, though Content-Disposition in API response is the real enforcer

    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

  } catch (error) {
    console.error('Download via proxy failed:', error);

    // Attempt Fallback: Direct window open if something goes wrong with the link trick
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

