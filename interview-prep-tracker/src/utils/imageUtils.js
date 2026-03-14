/**
 * Normalizes an image file to a 128x128 PNG data URL.
 *
 * Uses the Canvas API to resize and convert any browser-supported image format
 * (JPEG, PNG, WebP, GIF, etc.) to a standardized 128x128 PNG. The result is a
 * data URL suitable for storage in localStorage / cloud sync.
 *
 * @param {File} file - Image file from a file input or drag-drop
 * @param {number} [size=128] - Target width and height in pixels
 * @returns {Promise<string>} PNG data URL (e.g. "data:image/png;base64,...")
 */
export function normalizeImage(file, size = 128) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('File is not an image'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);

        resolve(canvas.toDataURL('image/png'));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}
