export type StorageProvider = 'supabase';

export type UploadFolder =
  | 'posts'
  | 'avatars'
  | 'banners'
  | 'groups'
  | 'stories'
  | 'chats'
  | 'audio'
  | 'events'
  | 'rooms'
  | 'stickers'
  | 'live';

export type MediaKind = 'image' | 'video' | 'audio';

export type UploadStatus =
  | 'idle'
  | 'validating'
  | 'compressing'
  | 'authorizing'
  | 'uploading'
  | 'completed'
  | 'cancelled'
  | 'error';

export type StorageUploadErrorCode =
  | 'auth/unauthenticated'
  | 'auth/invalid-token'
  | 'storage/not-configured'
  | 'storage/invalid-service-key'
  | 'storage/invalid-file'
  | 'storage/file-too-large'
  | 'storage/unsupported-type'
  | 'storage/invalid-bucket'
  | 'storage/invalid-path'
  | 'storage/timeout'
  | 'storage/cancelled'
  | 'storage/network-error'
  | 'storage/server-error'
  | 'storage/unknown';

export interface StorageUploadError {
  code: StorageUploadErrorCode;
  message: string;
  statusCode?: number;
  retryable: boolean;
  missingEnv?: string[];
  details?: string;
}

export class StorageError extends Error implements StorageUploadError {
  readonly code: StorageUploadErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly missingEnv?: string[];
  readonly details?: string;

  constructor(payload: StorageUploadError) {
    super(payload.message);
    this.name = 'StorageError';
    this.code = payload.code;
    this.statusCode = payload.statusCode;
    this.retryable = payload.retryable;
    this.missingEnv = payload.missingEnv;
    this.details = payload.details;
  }
}

export interface MediaMetadata {
  provider: StorageProvider;
  bucket: string;
  path: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  originalFileName?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface UploadProgressState {
  progress: number;
  loadedBytes?: number;
  totalBytes?: number;
  stage: UploadStatus;
}

export interface UploadProgressCallback {
  (progress: number, details?: UploadProgressState): void;
}

export interface UploadState {
  status: UploadStatus;
  progress: number;
  loadedBytes?: number;
  totalBytes?: number;
  localPreviewUrl?: string;
  publicUrl?: string;
  metadata?: MediaMetadata;
  error?: StorageUploadError | null;
}

export interface UploadValidationOptions {
  allowImages?: boolean;
  allowVideos?: boolean;
  allowAudio?: boolean;
}

export interface UploadValidationResult {
  isValid: boolean;
  kind?: MediaKind;
  error?: string;
  errorCode?: StorageUploadErrorCode;
}

export interface UploadControlHandle {
  promise: Promise<string>;
  cancel: () => void;
}

export interface UploadMediaOptions {
  onProgress?: UploadProgressCallback;
  onMetadata?: (metadata: MediaMetadata) => void;
  onStateChange?: (state: UploadState) => void;
  onError?: (error: StorageUploadError) => void;
  timeoutMs?: number;
  validation?: UploadValidationOptions;
  fileName?: string;
  bucket?: string;
  targetPath?: string;
}

export interface SignedUploadTicket {
  provider: StorageProvider;
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
  contentType: string;
  maxBytes?: number;
}

export interface StorageHealthResult {
  ok: boolean;
  provider: StorageProvider;
  configured: boolean;
  supabaseHost?: string;
  bucket?: string;
  bucketPublic?: boolean | null;
  bucketReady?: boolean;
  signedUrlReady?: boolean;
  keyType?: string;
  missingEnv?: string[];
  error?: string;
}
