import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebase/config';

export interface UploadProgressCallback {
  (progress: number): void;
}

export type UploadFolder = 'posts' | 'avatars' | 'banners' | 'stories';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

/**
 * Validates a media file for upload
 */
export function validateMediaFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'لم يتم تحديد أي ملف' };
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      isValid: false,
      error: 'نوع الملف غير مدعوم. يرجى اختيار صورة (JPG, PNG, WEBP, GIF) أو فيديو (MP4, WEBM).',
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `حجم الصورة يتجاوز الحد المسموح (10 ميجابايت). الحجم الحالي: ${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت`,
    };
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
    return {
      isValid: false,
      error: `حجم الفيديو يتجاوز الحد المسموح (30 ميجابايت). الحجم الحالي: ${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت`,
    };
  }

  return { isValid: true };
}

/**
 * Compresses an image file if it exceeds maximum dimensions
 */
export async function compressImage(file: File, maxDimension = 1920, quality = 0.85): Promise<Blob | File> {
  // If not an image or is a GIF (animated), don't compress via canvas
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width <= maxDimension && height <= maxDimension && file.size < 2 * 1024 * 1024) {
          resolve(file);
          return;
        }

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a media file to Firebase Storage and returns the public download URL
 */
export async function uploadMedia(
  file: File,
  folder: UploadFolder = 'posts',
  onProgress?: UploadProgressCallback
): Promise<string> {
  const validation = validateMediaFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error || 'الملف المحدد غير صالح للرفع');
  }

  const currentUser = auth.currentUser;
  const userId = currentUser?.uid || 'anonymous';

  // Sanitize filename and create unique storage path
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${folder}/${userId}/${timestamp}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  // Compress image if applicable
  const fileToUpload = file.type.startsWith('image/')
    ? await compressImage(file)
    : file;

  const metadata = {
    contentType: file.type,
    customMetadata: {
      uploadedBy: userId,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  };

  const uploadTask = uploadBytesResumable(storageRef, fileToUpload, metadata);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) {
          onProgress(progress);
        }
      },
      (error) => {
        console.error('Firebase Storage upload error:', error);
        reject(new Error(`فشل رفع الملف إلى الخادم: ${error.message}`));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (err: any) {
          reject(new Error(`تعذر الحصول على رابط التحميل: ${err?.message || ''}`));
        }
      }
    );
  });
}
