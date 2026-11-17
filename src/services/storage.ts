import { auth } from '../firebase/config';
import {
  MediaKind,
  MediaMetadata,
  SignedUploadTicket,
  StorageError,
  StorageHealthResult,
  StorageUploadError,
  StorageUploadErrorCode,
  UploadControlHandle,
  UploadFolder,
  UploadMediaOptions,
  UploadProgressCallback,
  UploadProgressState,
  UploadState,
  UploadStatus,
  UploadValidationOptions,
  UploadValidationResult,
} from '../types/storage';

export type {
  MediaKind,
  MediaMetadata,
  SignedUploadTicket,
  StorageHealthResult,
  StorageUploadError,
  StorageUploadErrorCode,
  UploadControlHandle,
  UploadFolder,
  UploadMediaOptions,
  UploadProgressCallback,
  UploadProgressState,
  UploadState,
  UploadStatus,
  UploadValidationOptions,
  UploadValidationResult,
};
export { StorageError };

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/x-m4a',
];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 30 * 1024 * 1024; // 30MB
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function createLocalPreview(file: Blob): string {
  return URL.createObjectURL(file);
}

export function revokeLocalPreview(url?: string | null): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revoke errors
    }
  }
}

export function isPersistentMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;
  return /^https?:\/\//i.test(trimmed);
}

export function detectMediaKind(file: File | Blob, fileName = ''): 'image' | 'video' | 'audio' | 'unknown' {
  const mime = (file.type || '').toLowerCase();
  const lowerName = (file instanceof File ? file.name : fileName).toLowerCase();

  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(lowerName)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(lowerName)) return 'video';
  if (mime.startsWith('audio/') || /\.(webm|ogg|mp3|wav|m4a|aac)$/i.test(lowerName)) return 'audio';
  return 'unknown';
}

export function validateMediaFile(
  file: File | Blob,
  options: UploadValidationOptions = { allowImages: true, allowVideos: true, allowAudio: false }
): UploadValidationResult {
  if (!file) {
    return { isValid: false, errorCode: 'storage/invalid-file', error: 'لم يتم تحديد أي ملف.' };
  }

  if (file.size === 0) {
    return { isValid: false, errorCode: 'storage/invalid-file', error: 'الملف المحدد فارغ (0 بايت).' };
  }

  const allowImages = options.allowImages ?? true;
  const allowVideos = options.allowVideos ?? true;
  const allowAudio = options.allowAudio ?? false;

  const lowerName = file instanceof File ? file.name.toLowerCase() : '';
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();

  const isImage =
    ALLOWED_IMAGE_TYPES.includes(mime) ||
    (!mime && /\.(jpe?g|png|webp|gif)$/i.test(lowerName));
  const isVideo =
    ALLOWED_VIDEO_TYPES.includes(mime) ||
    (!mime && /\.(mp4|webm|mov|m4v)$/i.test(lowerName));
  const isAudio =
    ALLOWED_AUDIO_TYPES.includes(mime) ||
    mime.startsWith('audio/') ||
    (!mime && /\.(ogg|mp3|wav|m4a|aac)$/i.test(lowerName));

  // WebM can be video or audio depending on context
  if (mime === 'video/webm' && !allowVideos && allowAudio) {
    return validateMediaFile(new File([file], 'voice.webm', { type: 'audio/webm' }), options);
  }

  if (isImage && allowImages) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return {
        isValid: false,
        errorCode: 'storage/file-too-large',
        error: `حجم الصورة يتجاوز الحد المسموح (10 ميجابايت). الحجم الحالي: ${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت.`,
      };
    }
    return { isValid: true, kind: 'image' };
  }

  if (isVideo && allowVideos) {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return {
        isValid: false,
        errorCode: 'storage/file-too-large',
        error: `حجم الفيديو يتجاوز الحد المسموح (30 ميجابايت). الحجم الحالي: ${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت.`,
      };
    }
    return { isValid: true, kind: 'video' };
  }

  if (isAudio && allowAudio) {
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      return {
        isValid: false,
        errorCode: 'storage/file-too-large',
        error: 'حجم التسجيل الصوتي يتجاوز الحد المسموح (10 ميجابايت).',
      };
    }
    return { isValid: true, kind: 'audio' };
  }

  const allowedLabels: string[] = [];
  if (allowImages) allowedLabels.push('صور (JPG, PNG, WEBP, GIF)');
  if (allowVideos) allowedLabels.push('فيديو (MP4, WEBM, MOV)');
  if (allowAudio) allowedLabels.push('صوت (WEBM, MP3, OGG, M4A)');

  return {
    isValid: false,
    errorCode: 'storage/unsupported-type',
    error: `نوع الملف غير مدعوم. الأنواع المسموحة: ${allowedLabels.join(' أو ')}.`,
  };
}

/**
 * Compresses an image file if it exceeds maximum dimensions or size threshold
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1920,
  quality = 0.85
): Promise<Blob | File> {
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

export async function checkSupabaseStorageHealth(): Promise<StorageHealthResult> {
  try {
    const res = await fetch('/api/storage/health');
    if (!res.ok) {
      return { ok: false, provider: 'supabase', configured: false, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as StorageHealthResult;
  } catch (err: any) {
    return {
      ok: false,
      provider: 'supabase',
      configured: false,
      error: err?.message || 'Network error',
    };
  }
}

class SignedUploadNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedUploadNetworkError';
  }
}

async function verifyUploadedMediaReadable(publicUrl: string, kind: 'image' | 'video' | 'audio'): Promise<boolean> {
  try {
    const res = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return false;
  } catch {
    // Fallback to image decode check below for images
    if (kind !== 'image') return false;
  }

  if (kind !== 'image' || typeof Image === 'undefined') {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      const ok = img.naturalWidth > 0 && img.naturalHeight > 0;
      cleanup();
      resolve(ok);
    };
    img.onerror = () => {
      cleanup();
      resolve(false);
    };
    img.src = publicUrl;
  });
}

function uploadViaXhrSignedUrl(
  signedUrl: string,
  fileBody: File | Blob,
  fileName: string,
  timeoutMs: number,
  onProgress: UploadProgressCallback | undefined,
  registerCancel: (fn: () => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const resetStall = () => {
      clearStall();
      stallTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          xhr.abort();
        } catch {
          // Ignore
        }
        reject(
          new Error(
            `انتهت مهلة الاتصال بخدمة Supabase Storage (${Math.round(timeoutMs / 1000)} ثانية). تأكد من اتصال الإنترنت ثم أعد المحاولة.`
          )
        );
      }, timeoutMs);
    };

    registerCancel(() => {
      if (settled) return;
      settled = true;
      clearStall();
      try {
        xhr.abort();
      } catch {
        // Ignore
      }
      reject(new Error('تم إلغاء عملية الرفع.'));
    });

    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (ev) => {
      resetStall();
      if (ev.lengthComputable && ev.total > 0 && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct, {
          progress: pct,
          loadedBytes: ev.loaded,
          totalBytes: ev.total,
          stage: 'uploading',
        });
      }
    };

    xhr.onload = () => {
      clearStall();
      if (settled) return;
      settled = true;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `فشل الرفع إلى Supabase Storage (HTTP ${xhr.status}).`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed?.message || parsed?.error) {
            msg = `تعذر حفظ الملف في Supabase Storage: ${parsed.message || parsed.error}`;
          }
        } catch {
          // Keep default message
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      clearStall();
      if (settled) return;
      settled = true;
      reject(new SignedUploadNetworkError('Network/CORS error during signed upload'));
    };

    xhr.onabort = () => {
      clearStall();
      if (settled) return;
      settled = true;
      reject(new Error('تم إلغاء عملية الرفع.'));
    };

    const formData = new FormData();
    formData.append('cacheControl', '3600');
    formData.append('', fileBody, fileName);

    resetStall();
    xhr.send(formData);
  });
}

function uploadViaBackendProxy(
  idToken: string,
  folder: UploadFolder,
  fileBody: File | Blob,
  fileName: string,
  contentType: string,
  timeoutMs: number,
  onProgress: UploadProgressCallback | undefined,
  registerCancel: (fn: () => void) => void,
  bucket?: string,
  targetPath?: string
): Promise<MediaMetadata> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const resetStall = () => {
      clearStall();
      stallTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          xhr.abort();
        } catch {
          // Ignore
        }
        reject(
          new Error(
            `انتهت مهلة الاتصال بالخادم أثناء الرفع (${Math.round(timeoutMs / 1000)} ثانية). أعد المحاولة.`
          )
        );
      }, timeoutMs);
    };

    registerCancel(() => {
      if (settled) return;
      settled = true;
      clearStall();
      try {
        xhr.abort();
      } catch {
        // Ignore
      }
      reject(new Error('تم إلغاء عملية الرفع.'));
    });

    xhr.open('POST', '/api/storage/upload', true);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('X-Upload-Folder', folder);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    if (bucket) xhr.setRequestHeader('X-Storage-Bucket', bucket);
    if (targetPath) xhr.setRequestHeader('X-Storage-Path', encodeURIComponent(targetPath));

    xhr.upload.onprogress = (ev) => {
      resetStall();
      if (ev.lengthComputable && ev.total > 0 && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct, {
          progress: pct,
          loadedBytes: ev.loaded,
          totalBytes: ev.total,
          stage: 'uploading',
        });
      }
    };

    xhr.onload = () => {
      clearStall();
      if (settled) return;
      settled = true;
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && isPersistentMediaUrl(parsed.publicUrl)) {
          resolve({
            provider: 'supabase',
            bucket: parsed.bucket,
            path: parsed.path,
            url: parsed.publicUrl,
            contentType: parsed.contentType || contentType,
            sizeBytes: parsed.sizeBytes || fileBody.size,
            uploadedAt: new Date().toISOString(),
          });
        } else {
          reject(new Error(parsed.error || `تعذر رفع الملف (HTTP ${xhr.status}).`));
        }
      } catch {
        reject(new Error(`تعذر قراءة استجابة الخادم (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      clearStall();
      if (settled) return;
      settled = true;
      reject(new Error('تعذر الاتصال بالخادم لرفع الملف. تحقق من اتصال الإنترنت.'));
    };

    xhr.onabort = () => {
      clearStall();
      if (settled) return;
      settled = true;
      reject(new Error('تم إلغاء عملية الرفع.'));
    };

    resetStall();
    xhr.send(fileBody);
  });
}

/**
 * Uploads a media file exclusively to Supabase Storage via Firebase-ID-token-verified backend authorization.
 * Supports real progress, cancellation, retry, validation, and image compression.
 * Never returns fake, blob, or data URLs.
 */
export function uploadMediaWithControl(
  file: File | Blob,
  folder: UploadFolder = 'posts',
  options: UploadMediaOptions = {}
): UploadControlHandle {
  let cancelledByUser = false;
  let activeCancelFn: (() => void) | null = null;
  let ticketAbortController: AbortController | null = null;

  const cancel = () => {
    cancelledByUser = true;
    try {
      ticketAbortController?.abort();
    } catch {
      // Ignore
    }
    try {
      activeCancelFn?.();
    } catch {
      // Ignore
    }
  };

  const emitState = (state: UploadState) => {
    options.onStateChange?.(state);
  };

  const emitProgress = (progress: number, details?: UploadProgressState) => {
    options.onProgress?.(progress, details);
    emitState({
      status: details?.stage || 'uploading',
      progress,
      loadedBytes: details?.loadedBytes,
      totalBytes: details?.totalBytes,
    });
  };

  const promise = (async (): Promise<string> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        throw new StorageError({
          code: 'auth/unauthenticated',
          message: 'يجب تسجيل الدخول لرفع الملفات.',
          statusCode: 401,
          retryable: false,
        });
      }

      emitState({ status: 'validating', progress: 0 });

      const defaultValidation: UploadValidationOptions =
        folder === 'avatars' || folder === 'banners' || folder === 'stickers' || folder === 'live'
          ? { allowImages: true, allowVideos: false, allowAudio: false }
          : folder === 'audio'
          ? { allowImages: false, allowVideos: false, allowAudio: true }
          : folder === 'chats'
          ? { allowImages: true, allowVideos: true, allowAudio: true }
          : { allowImages: true, allowVideos: true, allowAudio: false };

      const validation = validateMediaFile(file, options.validation ?? defaultValidation);
      if (!validation.isValid) {
        throw new StorageError({
          code: validation.errorCode || 'storage/invalid-file',
          message: validation.error || 'الملف المحدد غير صالح للرفع.',
          statusCode: 400,
          retryable: false,
        });
      }

      const rawName = options.fileName || (file instanceof File ? file.name : `media_${Date.now()}`);
      emitState({ status: 'compressing', progress: 0 });
      const fileToUpload = validation.kind === 'image' ? await compressImage(file) : file;

      if (cancelledByUser) {
        throw new StorageError({
          code: 'storage/cancelled',
          message: 'تم إلغاء عملية الرفع.',
          retryable: true,
        });
      }

      const resolvedContentType = (
        fileToUpload instanceof File && fileToUpload.type
          ? fileToUpload.type
          : fileToUpload.type ||
            file.type ||
            (validation.kind === 'image'
              ? 'image/jpeg'
              : validation.kind === 'video'
              ? 'video/mp4'
              : 'audio/webm')
      )
        .split(';')[0]
        .trim();

      emitState({ status: 'authorizing', progress: 0, totalBytes: fileToUpload.size });
      const idToken = await currentUser.getIdToken();
      if (cancelledByUser) {
        throw new StorageError({
          code: 'storage/cancelled',
          message: 'تم إلغاء عملية الرفع.',
          retryable: true,
        });
      }

      const timeoutMs = options.timeoutMs ?? 20000;
      ticketAbortController = new AbortController();
      const ticketTimer = setTimeout(() => ticketAbortController?.abort(), 10000);

      let ticket: SignedUploadTicket;
      try {
        const ticketRes = await fetch('/api/storage/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            folder,
            fileName: rawName,
            contentType: resolvedContentType,
            fileSize: fileToUpload.size,
            bucket: options.bucket,
            path: options.targetPath,
          }),
          signal: ticketAbortController.signal,
        });

        const payload = (await ticketRes.json().catch(() => ({}))) as Partial<SignedUploadTicket> & {
          error?: string;
          code?: StorageUploadErrorCode;
          missingEnv?: string[];
        };

        if (!ticketRes.ok || !payload.signedUrl || !payload.publicUrl) {
          const resolvedCode: StorageUploadErrorCode =
            payload.code || (ticketRes.status === 503 ? 'storage/not-configured' : 'storage/server-error');
          throw new StorageError({
            code: resolvedCode,
            message: payload.error || `تعذر تجهيز رابط الرفع (HTTP ${ticketRes.status}).`,
            statusCode: ticketRes.status,
            retryable: ticketRes.status >= 500,
            missingEnv: payload.missingEnv,
          });
        }

        ticket = payload as SignedUploadTicket;
      } catch (err: any) {
        if (err instanceof StorageError) throw err;
        if (cancelledByUser) {
          throw new StorageError({
            code: 'storage/cancelled',
            message: 'تم إلغاء عملية الرفع.',
            retryable: true,
          });
        }
        if (err?.name === 'AbortError') {
          throw new StorageError({
            code: 'storage/timeout',
            message: 'انتهت مهلة التحقق من خادم الرفع. يرجى المحاولة مجدداً.',
            retryable: true,
          });
        }
        throw new StorageError({
          code: 'storage/network-error',
          message: err?.message || 'تعذر الاتصال بخادم تفويض الرفع.',
          retryable: true,
        });
      } finally {
        clearTimeout(ticketTimer);
        ticketAbortController = null;
      }

      if (cancelledByUser) {
        throw new StorageError({
          code: 'storage/cancelled',
          message: 'تم إلغاء عملية الرفع.',
          retryable: true,
        });
      }

      let finalMetadata: MediaMetadata;

      try {
        await uploadViaXhrSignedUrl(
          ticket.signedUrl,
          fileToUpload,
          rawName,
          timeoutMs,
          emitProgress,
          (fn) => {
            activeCancelFn = fn;
          }
        );

        if (!isPersistentMediaUrl(ticket.publicUrl)) {
          throw new StorageError({
            code: 'storage/server-error',
            message: 'لم يتم إرجاع رابط تخزين صالح.',
            retryable: true,
          });
        }

        // Verify the uploaded media object is publicly readable and decodable;
        // if signed URL write failed/corrupted, transparently retry via authenticated backend binary proxy
        const readableAfterSignedPut = await verifyUploadedMediaReadable(
          ticket.publicUrl,
          validation.kind || 'image'
        );
        if (!readableAfterSignedPut) {
          throw new SignedUploadNetworkError('Uploaded media not readable from public URL');
        }

        finalMetadata = {
          provider: 'supabase',
          bucket: ticket.bucket,
          path: ticket.path,
          url: ticket.publicUrl,
          contentType: resolvedContentType,
          sizeBytes: fileToUpload.size,
          uploadedAt: new Date().toISOString(),
          originalFileName: rawName,
        };
      } catch (err: any) {
        if (cancelledByUser) {
          throw new StorageError({
            code: 'storage/cancelled',
            message: 'تم إلغاء عملية الرفع.',
            retryable: true,
          });
        }
        // Fallback to authenticated server-side binary upload if browser-direct PUT hits CORS/network/readability block
        if (err instanceof SignedUploadNetworkError) {
          finalMetadata = await uploadViaBackendProxy(
            idToken,
            folder,
            fileToUpload,
            rawName,
            resolvedContentType,
            timeoutMs,
            emitProgress,
            (fn) => {
              activeCancelFn = fn;
            },
            options.bucket,
            options.targetPath
          );
          finalMetadata.originalFileName = rawName;
          const readableAfterProxy = await verifyUploadedMediaReadable(
            finalMetadata.url,
            validation.kind || 'image'
          );
          if (!readableAfterProxy) {
            throw new StorageError({
              code: 'storage/server-error',
              message: 'تم رفع الملف لكن تعذر التحقق من صلاحية قراءته للعرض. تأكد من إعدادات Supabase Bucket.',
              retryable: true,
            });
          }
        } else {
          throw err;
        }
      } finally {
        activeCancelFn = null;
      }

      options.onProgress?.(100, {
        progress: 100,
        loadedBytes: finalMetadata.sizeBytes,
        totalBytes: finalMetadata.sizeBytes,
        stage: 'completed',
      });
      options.onMetadata?.(finalMetadata);
      emitState({
        status: 'completed',
        progress: 100,
        loadedBytes: finalMetadata.sizeBytes,
        totalBytes: finalMetadata.sizeBytes,
        publicUrl: finalMetadata.url,
        metadata: finalMetadata,
        error: null,
      });
      return finalMetadata.url;
    } catch (err: any) {
      const normalizedError: StorageUploadError =
        err instanceof StorageError
          ? {
              code: err.code,
              message: err.message,
              statusCode: err.statusCode,
              retryable: err.retryable,
              missingEnv: err.missingEnv,
              details: err.details,
            }
          : {
              code: cancelledByUser ? 'storage/cancelled' : 'storage/unknown',
              message: err?.message || 'حدث خطأ أثناء رفع الملف.',
              retryable: !cancelledByUser,
            };

      options.onError?.(normalizedError);
      emitState({
        status: cancelledByUser ? 'cancelled' : 'error',
        progress: 0,
        error: normalizedError,
      });
      throw err instanceof Error ? err : new StorageError(normalizedError);
    }
  })();

  return { promise, cancel };
}

/**
 * Deletes one or more user-owned media objects from Supabase Storage via authenticated backend check.
 */
export async function deleteMediaFromStorage(target: {
  urls?: string[];
  paths?: string[];
}): Promise<string[]> {
  const currentUser = auth.currentUser;
  if (!currentUser?.uid) return [];

  const urls = (target.urls || []).filter((u) => isPersistentMediaUrl(u));
  const paths = (target.paths || []).filter(Boolean);
  if (urls.length === 0 && paths.length === 0) return [];

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/storage/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ urls, paths }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { deleted?: string[] };
    return Array.isArray(data.deleted) ? data.deleted : [];
  } catch {
    return [];
  }
}

/**
 * Uploads a file to Supabase Storage given a file, bucket name, and path, and returns the public URL.
 * Server-side Express gateway verifies Firebase ID token and uses server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
export async function uploadFile(
  file: File | Blob,
  bucketName: string,
  path: string,
  options: Omit<UploadMediaOptions, 'bucket' | 'targetPath'> = {}
): Promise<string> {
  const trimmedBucket = String(bucketName || '').trim();
  const trimmedPath = String(path || '').trim().replace(/^\/+/, '');

  if (!trimmedBucket || !/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(trimmedBucket)) {
    throw new Error('اسم حاوية التخزين (bucketName) غير صالح.');
  }
  if (!trimmedPath || trimmedPath.includes('..')) {
    throw new Error('مسار حفظ الملف (path) غير صالح.');
  }

  const firstSegment = trimmedPath.split('/')[0] as UploadFolder;
  const validFolders: UploadFolder[] = ['posts', 'avatars', 'banners', 'groups', 'stories', 'chats', 'audio', 'events', 'rooms', 'stickers', 'live'];
  const inferredFolder: UploadFolder = validFolders.includes(firstSegment) ? firstSegment : 'posts';
  const leafName = trimmedPath.split('/').pop() || (file instanceof File ? file.name : `media_${Date.now()}`);

  return uploadMediaWithControl(file, inferredFolder, {
    ...options,
    fileName: options.fileName || leafName,
    bucket: trimmedBucket,
    targetPath: trimmedPath,
  }).promise;
}

/**
 * Uploads a media file to Supabase Storage and returns the public URL
 */
export async function uploadMedia(
  file: File | Blob,
  folder: UploadFolder = 'posts',
  onProgress?: UploadProgressCallback
): Promise<string> {
  return uploadMediaWithControl(file, folder, { onProgress }).promise;
}
