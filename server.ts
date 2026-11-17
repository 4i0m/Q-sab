import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type UploadFolder = 'avatars' | 'banners' | 'posts' | 'stories' | 'chats' | 'audio' | 'groups' | 'events' | 'rooms' | 'stickers' | 'live';

interface FirebaseConfigFile {
  projectId?: string;
}

const VALID_FOLDERS: ReadonlySet<UploadFolder> = new Set([
  'avatars',
  'banners',
  'posts',
  'stories',
  'chats',
  'audio',
  'groups',
  'events',
  'rooms',
  'stickers',
  'live',
]);

const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_MIME: ReadonlySet<string> = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

const ALLOWED_AUDIO_MIME: ReadonlySet<string> = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/x-m4a',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function loadFirebaseProjectId(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as FirebaseConfigFile;
    if (parsed.projectId) return parsed.projectId;
  } catch {
    // Fallback to env if provided
  }
  return process.env.FIREBASE_PROJECT_ID || '';
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

async function verifyFirebaseAuthHeader(authHeader: string | undefined): Promise<{ uid: string; email?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('AUTH_MISSING');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('AUTH_MISSING');
  }
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_MISSING');
  }

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!uid || uid.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
    throw new Error('AUTH_INVALID_UID');
  }

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}

function sanitizeEnvSecret(raw: string): string {
  let val = (raw || '').trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).trim();
  }
  const envAssignMatch = val.match(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/);
  if (envAssignMatch && envAssignMatch[1]) {
    val = envAssignMatch[1].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
  }
  if (/^bearer\s+/i.test(val)) {
    val = val.replace(/^bearer\s+/i, '').trim();
  }
  return val;
}

type SupabaseKeyType =
  | 'service_role_jwt'
  | 'sb_secret'
  | 'invalid_publishable_key'
  | 'invalid_format'
  | 'missing';

function classifySupabaseKeyType(key: string): SupabaseKeyType {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'sb_secret';
  if (key.startsWith('sb_publishable_') || key.includes('sb_publishable_')) {
    return 'invalid_publishable_key';
  }
  if (key.split('.').length === 3 && key.startsWith('eyJ')) return 'service_role_jwt';
  return 'invalid_format';
}

function buildInvalidKeyErrorMessage(keyType: SupabaseKeyType): string {
  if (keyType === 'invalid_publishable_key') {
    return 'المفتاح المضبوط في SUPABASE_SERVICE_ROLE_KEY هو مفتاح عام (sb_publishable_) ولا يملك صلاحية رفع الملفات. يرجى استبداله بمفتاح السيرفر السري (Secret key: sb_secret_... أو service_role JWT: eyJ...) من لوحة Supabase -> Project Settings -> API Keys.';
  }
  return 'تنسيق SUPABASE_SERVICE_ROLE_KEY غير صالح (يجب أن يكون service_role JWT يبدأ بـ eyJ... أو Secret key يبدأ بـ sb_secret_...). يرجى إعادة نسخه بدقة بدون نصوص إضافية من Supabase -> Project Settings -> API Keys.';
}

const SUPABASE_SECRET_ENV_CANDIDATES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_KEY',
  'SB_SECRET_KEY',
] as const;

function resolveSupabaseSecretEnv(): { key: string; sourceEnv: string; keyType: SupabaseKeyType } {
  const candidates = SUPABASE_SECRET_ENV_CANDIDATES.map((envName) => {
    const cleaned = sanitizeEnvSecret(process.env[envName] || '');
    return {
      envName,
      cleaned,
      keyType: classifySupabaseKeyType(cleaned),
    };
  });

  const validCandidate = candidates.find(
    (c) => c.keyType === 'sb_secret' || c.keyType === 'service_role_jwt'
  );
  if (validCandidate) {
    return {
      key: validCandidate.cleaned,
      sourceEnv: validCandidate.envName,
      keyType: validCandidate.keyType,
    };
  }

  const nonEmptyCandidate = candidates.find((c) => Boolean(c.cleaned));
  if (nonEmptyCandidate) {
    return {
      key: nonEmptyCandidate.cleaned,
      sourceEnv: nonEmptyCandidate.envName,
      keyType: nonEmptyCandidate.keyType,
    };
  }

  return {
    key: '',
    sourceEnv: 'SUPABASE_SERVICE_ROLE_KEY',
    keyType: 'missing',
  };
}

function getSupabaseConfig() {
  const url = sanitizeEnvSecret(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const resolved = resolveSupabaseSecretEnv();
  const serviceRoleKey = resolved.key;
  const bucket = sanitizeEnvSecret(process.env.SUPABASE_STORAGE_BUCKET || 'q-media') || 'q-media';
  const missingEnv: string[] = [];
  if (!url) missingEnv.push('SUPABASE_URL');
  if (!serviceRoleKey) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY');

  let urlValid = false;
  try {
    const parsed = new URL(url);
    urlValid = parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    urlValid = false;
  }

  return {
    url,
    urlValid,
    serviceRoleKey,
    keyType: resolved.keyType,
    sourceEnv: resolved.sourceEnv,
    bucket,
    missingEnv,
    configured: missingEnv.length === 0,
  };
}

let cachedSupabaseClient: SupabaseClient | null = null;
let cachedSupabaseSignature = '';
let bucketInitializedFor = '';

function isValidBucketName(bucket: string): boolean {
  return typeof bucket === 'string' && /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(bucket);
}

function createSupabaseFetchForKey(serviceRoleKey: string): typeof fetch | undefined {
  // New-format Supabase keys (sb_secret_...) are NOT JWTs.
  // @supabase/supabase-js 2.119.0 sends `Authorization: Bearer <key>` on Storage requests unless stripped,
  // which causes Supabase Storage to fail with "Invalid Compact JWS".
  if (!serviceRoleKey.startsWith('sb_')) {
    return undefined;
  }
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const authVal = headers.get('Authorization') || headers.get('authorization');
    if (authVal && authVal === `Bearer ${serviceRoleKey}`) {
      headers.delete('Authorization');
      headers.delete('authorization');
    }
    return fetch(input, { ...init, headers });
  };
}

function getSupabaseAdminClient(requestedBucket?: string): { client: SupabaseClient; bucket: string; url: string } {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) {
    const err = new Error(`Missing Supabase configuration: ${cfg.missingEnv.join(', ')}`);
    (err as Error & { code?: string; missingEnv?: string[] }).code = 'storage/not-configured';
    (err as Error & { missingEnv?: string[] }).missingEnv = cfg.missingEnv;
    throw err;
  }

  if (cfg.keyType === 'invalid_publishable_key' || cfg.keyType === 'invalid_format') {
    const err = new Error(buildInvalidKeyErrorMessage(cfg.keyType));
    (err as Error & { code?: string }).code = 'storage/invalid-service-key';
    throw err;
  }

  const resolvedBucket = requestedBucket && isValidBucketName(requestedBucket) ? requestedBucket : cfg.bucket;
  const sig = `${cfg.url}::${cfg.bucket}::${cfg.keyType}::${cfg.serviceRoleKey.length}`;
  if (!cachedSupabaseClient || cachedSupabaseSignature !== sig) {
    const customFetch = createSupabaseFetchForKey(cfg.serviceRoleKey);
    cachedSupabaseClient = createClient(cfg.url, cfg.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      ...(customFetch ? { global: { fetch: customFetch } } : {}),
    });
    cachedSupabaseSignature = sig;
    bucketInitializedFor = '';
  }

  return { client: cachedSupabaseClient, bucket: resolvedBucket, url: cfg.url };
}

function normalizeStorageServerError(err: unknown, fallbackMessage: string): {
  status: number;
  code: string;
  message: string;
  missingEnv?: string[];
} {
  const errObj = err as { code?: string; missingEnv?: string[]; message?: string };
  const rawMessage = err instanceof Error ? err.message : String(errObj?.message || '');
  const code = errObj?.code;

  if (code === 'storage/not-configured') {
    return {
      status: 503,
      code,
      missingEnv: errObj.missingEnv,
      message:
        'خدمة Supabase Storage غير مفعّلة على الخادم بعد. يرجى ضبط SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في إعدادات البيئة.',
    };
  }

  if (
    code === 'storage/invalid-service-key' ||
    /invalid compact jws|invalidjwt|signature verification failed/i.test(rawMessage)
  ) {
    const cfg = getSupabaseConfig();
    return {
      status: 503,
      code: 'storage/invalid-service-key',
      message: buildInvalidKeyErrorMessage(cfg.keyType),
    };
  }

  return {
    status: 500,
    code: code || 'storage/server-error',
    message: rawMessage || fallbackMessage,
  };
}

export async function uploadFile(
  file: Buffer | Uint8Array | Blob | File,
  bucketName: string,
  targetPath: string,
  contentType = 'application/octet-stream'
): Promise<string> {
  if (!file) throw new Error('File is required.');
  if (!isValidBucketName(bucketName)) throw new Error('Invalid Supabase bucket name.');
  const normalizedPath = targetPath.trim().replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath.includes('..')) {
    throw new Error('Invalid storage object path.');
  }

  const { client, bucket } = getSupabaseAdminClient(bucketName);
  await ensureSupabaseBucket(client, bucket);

  const { error } = await client.storage.from(bucket).upload(normalizedPath, file, {
    contentType: normalizeMime(contentType) || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;

  const { data } = client.storage.from(bucket).getPublicUrl(normalizedPath);
  return data.publicUrl;
}

async function ensureSupabaseBucket(client: SupabaseClient, bucket: string): Promise<void> {
  if (bucketInitializedFor === bucket) return;

  const allowedMimeTypes = [
    ...ALLOWED_IMAGE_MIME,
    ...ALLOWED_VIDEO_MIME,
    ...ALLOWED_AUDIO_MIME,
  ];

  const { data: existingBucket, error: getErr } = await client.storage.getBucket(bucket);
  if (!getErr && existingBucket) {
    if (existingBucket.public !== true) {
      const { error: updateErr } = await client.storage.updateBucket(bucket, {
        public: true,
        fileSizeLimit: MAX_VIDEO_BYTES,
        allowedMimeTypes,
      });
      if (updateErr) {
        console.warn('[Storage] Failed to ensure bucket public:', updateErr.message);
      }
    }
    bucketInitializedFor = bucket;
    return;
  }

  const { error: createErr } = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: MAX_VIDEO_BYTES,
    allowedMimeTypes,
  });

  if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
    throw createErr;
  }
  bucketInitializedFor = bucket;
}

function detectImageOrMediaSignatureIssue(buffer: Buffer, contentType: string): string | null {
  if (!buffer || buffer.length < 4) return 'الملف فارغ أو تالف.';
  // Detect accidental raw multipart boundary written inside binary body
  const headText = buffer.subarray(0, Math.min(128, buffer.length)).toString('utf8');
  if (/^--[-a-zA-Z0-9_]+[\r\n]/.test(headText) || headText.includes('Content-Disposition: form-data')) {
    return 'تم اكتشاف بيانات multipart تالفة داخل الملف.';
  }

  if (contentType === 'image/jpeg') {
    if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
      return 'ملف JPEG غير صالح أو تالف.';
    }
  } else if (contentType === 'image/png') {
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      return 'ملف PNG غير صالح أو تالف.';
    }
  } else if (contentType === 'image/gif') {
    const sig = buffer.subarray(0, 6).toString('ascii');
    if (sig !== 'GIF87a' && sig !== 'GIF89a') {
      return 'ملف GIF غير صالح أو تالف.';
    }
  } else if (contentType === 'image/webp') {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      return 'ملف WEBP غير صالح أو تالف.';
    }
  }
  return null;
}

function normalizeMime(contentType: string): string {
  return String(contentType || '').toLowerCase().split(';')[0].trim();
}

function validateUploadRequest(folderRaw: string, contentTypeRaw: string, fileSize: number) {
  if (!VALID_FOLDERS.has(folderRaw as UploadFolder)) {
    return { valid: false as const, status: 400, error: 'مسار التخزين المطلوب غير صالح.' };
  }
  const folder = folderRaw as UploadFolder;
  const contentType = normalizeMime(contentTypeRaw);

  const isImage = ALLOWED_IMAGE_MIME.has(contentType);
  const isVideo = ALLOWED_VIDEO_MIME.has(contentType);
  const isAudio = ALLOWED_AUDIO_MIME.has(contentType) || contentType.startsWith('audio/');

  const allowImages = folder !== 'audio';
  const allowVideos = folder === 'posts' || folder === 'stories' || folder === 'chats' || folder === 'groups' || folder === 'rooms';
  const allowAudio = folder === 'audio' || folder === 'chats' || folder === 'rooms';

  let maxBytes = MAX_IMAGE_BYTES;
  if (isImage && allowImages) {
    maxBytes = folder === 'stickers' ? 2 * 1024 * 1024 : MAX_IMAGE_BYTES;
  } else if (isVideo && allowVideos) {
    maxBytes = MAX_VIDEO_BYTES;
  } else if (isAudio && allowAudio) {
    maxBytes = MAX_AUDIO_BYTES;
  } else {
    return {
      valid: false as const,
      status: 415,
      error: `نوع الملف (${contentType || 'unknown'}) غير مسموح لهذا القسم.`,
    };
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { valid: false as const, status: 400, error: 'حجم الملف غير صالح.' };
  }
  if (fileSize > maxBytes) {
    return {
      valid: false as const,
      status: 413,
      error: `حجم الملف يتجاوز الحد المسموح (${Math.round(maxBytes / (1024 * 1024))} ميجابايت).`,
    };
  }

  return { valid: true as const, folder, contentType, maxBytes };
}

function buildUserObjectPath(
  folder: UploadFolder,
  uid: string,
  rawFileName: string,
  contentType: string,
  requestedPath?: string
): string {
  if (requestedPath && typeof requestedPath === 'string') {
    const cleaned = requestedPath
      .trim()
      .replace(/^\/+/, '')
      .replace(/[^a-zA-Z0-9/._-]/g, '_');
    if (cleaned && !cleaned.includes('..')) {
      const segments = cleaned.split('/').filter(Boolean);
      const safeLeaf = segments[segments.length - 1] || 'media';
      // Always enforce `${folder}/${uid}/...` strict ownership path layout
      return `${folder}/${uid}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeLeaf.slice(0, 80)}`;
    }
  }

  const cleanName = String(rawFileName || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  const extFromMime = contentType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'bin';
  const finalName = cleanName && cleanName.includes('.') ? cleanName : `${cleanName || 'media'}.${extFromMime}`;
  const randomTag = crypto.randomBytes(4).toString('hex');
  return `${folder}/${uid}/${Date.now()}_${randomTag}_${finalName}`;
}

function extractBucketPathFromInput(input: string, supabaseUrl: string, bucket: string): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed || trimmed.includes('..')) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const parsed = new URL(trimmed);
    const expectedHost = new URL(supabaseUrl).host;
    if (parsed.host !== expectedHost) return null;

    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    const authPrefix = `/storage/v1/object/authenticated/${bucket}/`;
    const signPrefix = `/storage/v1/object/sign/${bucket}/`;

    for (const prefix of [publicPrefix, authPrefix, signPrefix]) {
      if (parsed.pathname.startsWith(prefix)) {
        return decodeURIComponent(parsed.pathname.slice(prefix.length));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isOwnedUserPath(objectPath: string, uid: string): boolean {
  const parts = objectPath.split('/');
  if (parts.length !== 3) return false;
  const [folder, ownerUid, fileName] = parts;
  if (!VALID_FOLDERS.has(folder as UploadFolder)) return false;
  if (ownerUid !== uid) return false;
  if (!fileName || fileName.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(fileName)) return false;
  return true;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/storage/health', async (_req: Request, res: Response) => {
    const cfg = getSupabaseConfig();
    if (!cfg.configured) {
      res.status(200).json({
        ok: false,
        provider: 'supabase',
        configured: false,
        keyType: cfg.keyType,
        sourceEnv: cfg.sourceEnv,
        bucket: cfg.bucket,
        missingEnv: cfg.missingEnv,
      });
      return;
    }

    try {
      const { client, bucket, url } = getSupabaseAdminClient();
      const supabaseHost = (() => {
        try {
          return new URL(url).host;
        } catch {
          return '';
        }
      })();
      const { data: bucketData, error } = await client.storage.getBucket(bucket);
      if (!error && bucketData && bucketData.public !== true) {
        await client.storage.updateBucket(bucket, {
          public: true,
          fileSizeLimit: MAX_VIDEO_BYTES,
          allowedMimeTypes: [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME, ...ALLOWED_AUDIO_MIME],
        });
      }

      let signedUrlProbeError: string | null = null;
      let folderCounts: Record<string, number> = {};
      if (!error) {
        const { error: signErr } = await client.storage
          .from(bucket)
          .createSignedUploadUrl(`_healthcheck/${Date.now()}_probe.txt`);
        signedUrlProbeError = signErr ? signErr.message : null;
        const { data: rootItems } = await client.storage.from(bucket).list('', { limit: 20 });
        if (Array.isArray(rootItems)) {
          for (const item of rootItems) {
            if (item?.name) folderCounts[item.name] = 1;
          }
        }
      }
      const probeError = error?.message || signedUrlProbeError || null;
      res.status(200).json({
        ok: !probeError,
        provider: 'supabase',
        configured: true,
        keyType: cfg.keyType,
        sourceEnv: cfg.sourceEnv,
        supabaseHost,
        bucket,
        bucketPublic: bucketData ? Boolean(bucketData.public) : null,
        bucketReady: !error,
        signedUrlReady: !probeError,
        rootFolders: Object.keys(folderCounts),
        ...(probeError ? { error: probeError } : {}),
      });
    } catch (err: unknown) {
      const normalized = normalizeStorageServerError(err, 'Storage probe failed');
      res.status(200).json({
        ok: false,
        provider: 'supabase',
        configured: true,
        keyType: cfg.keyType,
        sourceEnv: cfg.sourceEnv,
        bucket: cfg.bucket,
        bucketReady: false,
        signedUrlReady: false,
        error: normalized.message,
      });
    }
  });

  app.post('/api/storage/upload-url', express.json({ limit: '64kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({
        code: 'auth/invalid-token',
        error: 'فشل التحقق من جلسة المستخدم. يرجى إعادة تسجيل الدخول.',
      });
      return;
    }

    const { folder = 'posts', fileName = 'media', contentType = '', fileSize = 0, bucket: requestedBucket, path: requestedPath } = (req.body || {}) as {
      folder?: string;
      fileName?: string;
      contentType?: string;
      fileSize?: number;
      bucket?: string;
      path?: string;
    };

    if (requestedBucket && !isValidBucketName(String(requestedBucket))) {
      res.status(400).json({ code: 'storage/invalid-bucket', error: 'اسم حاوية التخزين غير صالح.' });
      return;
    }

    const validation = validateUploadRequest(String(folder), String(contentType), Number(fileSize));
    if (!validation.valid) {
      res.status(validation.status).json({ code: 'storage/invalid-file', error: validation.error });
      return;
    }

    try {
      const { client, bucket } = getSupabaseAdminClient(requestedBucket ? String(requestedBucket) : undefined);
      await ensureSupabaseBucket(client, bucket);

      const storagePath = buildUserObjectPath(
        validation.folder,
        authUser.uid,
        fileName,
        validation.contentType,
        requestedPath
      );

      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(storagePath);
      if (error || !data?.signedUrl) {
        throw error || new Error('Failed to generate signed upload URL');
      }

      const { data: pubData } = client.storage.from(bucket).getPublicUrl(storagePath);

      res.status(200).json({
        provider: 'supabase',
        bucket,
        path: storagePath,
        signedUrl: data.signedUrl,
        token: data.token,
        publicUrl: pubData.publicUrl,
        contentType: validation.contentType,
        maxBytes: validation.maxBytes,
      });
    } catch (err: unknown) {
      const normalized = normalizeStorageServerError(err, 'تعذر إنشاء رابط الرفع السحابي.');
      res.status(normalized.status).json({
        code: normalized.code,
        missingEnv: normalized.missingEnv,
        error: normalized.message,
      });
    }
  });

  app.post(
    '/api/storage/upload',
    express.raw({ type: '*/*', limit: '32mb' }),
    async (req: Request, res: Response) => {
      let authUser: { uid: string; email?: string };
      try {
        authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
      } catch {
        res.status(401).json({
          code: 'auth/invalid-token',
          error: 'فشل التحقق من جلسة المستخدم. يرجى إعادة تسجيل الدخول.',
        });
        return;
      }

      const folderHeader = String(req.headers['x-upload-folder'] || 'posts');
      const fileNameHeader = decodeURIComponent(String(req.headers['x-file-name'] || 'media'));
      const bucketHeader = req.headers['x-storage-bucket'] ? String(req.headers['x-storage-bucket']) : undefined;
      const pathHeader = req.headers['x-storage-path'] ? decodeURIComponent(String(req.headers['x-storage-path'])) : undefined;
      const contentTypeHeader = String(req.headers['content-type'] || 'application/octet-stream');
      const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      if (bucketHeader && !isValidBucketName(bucketHeader)) {
        res.status(400).json({ code: 'storage/invalid-bucket', error: 'اسم حاوية التخزين غير صالح.' });
        return;
      }

      const validation = validateUploadRequest(folderHeader, contentTypeHeader, bodyBuffer.length);
      if (!validation.valid) {
        res.status(validation.status).json({ code: 'storage/invalid-file', error: validation.error });
        return;
      }

      const sigIssue = detectImageOrMediaSignatureIssue(bodyBuffer, validation.contentType);
      if (sigIssue) {
        res.status(400).json({ code: 'storage/corrupted-file', error: sigIssue });
        return;
      }

      try {
        const { client, bucket } = getSupabaseAdminClient(bucketHeader);
        await ensureSupabaseBucket(client, bucket);

        const storagePath = buildUserObjectPath(
          validation.folder,
          authUser.uid,
          fileNameHeader,
          validation.contentType,
          pathHeader
        );

        const { error: uploadErr } = await client.storage.from(bucket).upload(storagePath, bodyBuffer, {
          contentType: validation.contentType,
          cacheControl: '3600',
          upsert: false,
        });

        if (uploadErr) {
          throw uploadErr;
        }

        const { data: pubData } = client.storage.from(bucket).getPublicUrl(storagePath);

        res.status(200).json({
          provider: 'supabase',
          bucket,
          path: storagePath,
          publicUrl: pubData.publicUrl,
          contentType: validation.contentType,
          sizeBytes: bodyBuffer.length,
        });
      } catch (err: unknown) {
        const normalized = normalizeStorageServerError(err, 'تعذر رفع الملف إلى Supabase Storage.');
        res.status(normalized.status).json({
          code: normalized.code,
          missingEnv: normalized.missingEnv,
          error: normalized.message,
        });
      }
    }
  );

  app.post('/api/storage/delete', express.json({ limit: '64kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({
        code: 'auth/invalid-token',
        error: 'فشل التحقق من جلسة المستخدم. يرجى إعادة تسجيل الدخول.',
      });
      return;
    }

    const body = (req.body || {}) as {
      path?: string;
      url?: string;
      paths?: string[];
      urls?: string[];
    };

    const rawInputs = [
      ...(body.path ? [body.path] : []),
      ...(body.url ? [body.url] : []),
      ...(Array.isArray(body.paths) ? body.paths : []),
      ...(Array.isArray(body.urls) ? body.urls : []),
    ].slice(0, 20);

    if (rawInputs.length === 0) {
      res.status(200).json({ deleted: [] });
      return;
    }

    try {
      const { client, bucket, url } = getSupabaseAdminClient();
      const candidatePaths = rawInputs
        .map((item) => extractBucketPathFromInput(item, url, bucket))
        .filter((p): p is string => Boolean(p));

      const ownedPaths = Array.from(
        new Set(candidatePaths.filter((p) => isOwnedUserPath(p, authUser.uid)))
      );

      if (ownedPaths.length === 0) {
        res.status(200).json({ deleted: [], skipped: candidatePaths.length });
        return;
      }

      const { error } = await client.storage.from(bucket).remove(ownedPaths);
      if (error) {
        throw error;
      }

      res.status(200).json({ deleted: ownedPaths });
    } catch (err: unknown) {
      const normalized = normalizeStorageServerError(err, 'تعذر حذف الملف من التخزين السحابي.');
      res.status(normalized.status).json({
        code: normalized.code,
        error: normalized.message,
      });
    }
  });

  /* =========================================================================
     FIRESTORE REST GOVERNANCE, CUSTOM TITLES & LEVEL XP ROUTES
     ========================================================================= */

  const ROLE_RANK_MAP: Record<string, number> = {
    user: 1,
    moderator: 2,
    room_leader: 3,
    assistant_admin: 4,
    admin: 5,
    owner: 6,
  };

  function loadFirestoreDbId(): string {
    try {
      const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
      const parsed = JSON.parse(raw) as { firestoreDatabaseId?: string };
      if (parsed.firestoreDatabaseId) return parsed.firestoreDatabaseId;
    } catch {
      // ignore
    }
    return process.env.FIRESTORE_DATABASE_ID || '(default)';
  }

  const FIRESTORE_DATABASE_ID = loadFirestoreDbId();
  const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

  function toFsValue(val: unknown): Record<string, unknown> {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map((item) => toFsValue(item)) } };
    }
    if (typeof val === 'object') {
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (v !== undefined) fields[k] = toFsValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFsValue(fsVal: any): any {
    if (!fsVal || typeof fsVal !== 'object') return undefined;
    if ('nullValue' in fsVal) return null;
    if ('stringValue' in fsVal) return fsVal.stringValue;
    if ('booleanValue' in fsVal) return Boolean(fsVal.booleanValue);
    if ('integerValue' in fsVal) return Number(fsVal.integerValue);
    if ('doubleValue' in fsVal) return Number(fsVal.doubleValue);
    if ('timestampValue' in fsVal) return fsVal.timestampValue;
    if ('arrayValue' in fsVal) {
      return Array.isArray(fsVal.arrayValue?.values)
        ? fsVal.arrayValue.values.map((v: any) => fromFsValue(v))
        : [];
    }
    if ('mapValue' in fsVal) {
      const obj: Record<string, any> = {};
      const fields = fsVal.mapValue?.fields || {};
      for (const [k, v] of Object.entries(fields)) {
        obj[k] = fromFsValue(v);
      }
      return obj;
    }
    return undefined;
  }

  function docToObj(docJson: any): Record<string, any> | null {
    if (!docJson || !docJson.fields) return null;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(docJson.fields)) {
      out[k] = fromFsValue(v);
    }
    return out;
  }

  async function fsGetDoc(docPath: string, bearerToken: string) {
    const r = await fetch(`${FIRESTORE_REST_BASE}/${docPath}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (r.status === 404) return null;
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Firestore GET ${docPath} failed (${r.status}): ${txt}`);
    }
    return docToObj(await r.json());
  }

  async function fsPatchDoc(docPath: string, fieldsObj: Record<string, unknown>, bearerToken: string) {
    const cleanEntries = Object.entries(fieldsObj).filter(([, v]) => v !== undefined);
    const maskParams = cleanEntries.map(([k]) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const fields: Record<string, unknown> = {};
    for (const [k, v] of cleanEntries) {
      fields[k] = toFsValue(v);
    }
    const r = await fetch(`${FIRESTORE_REST_BASE}/${docPath}?${maskParams}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Firestore PATCH ${docPath} failed (${r.status}): ${txt}`);
    }
    return await r.json();
  }

  async function fsCreateDoc(collectionPath: string, docId: string, obj: Record<string, unknown>, bearerToken: string) {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) fields[k] = toFsValue(v);
    }
    const r = await fetch(`${FIRESTORE_REST_BASE}/${collectionPath}?documentId=${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) {
      const txt = await r.text();
      const err = new Error(`Firestore CREATE ${collectionPath}/${docId} failed (${r.status}): ${txt}`) as Error & { status?: number; body?: string };
      err.status = r.status;
      err.body = txt;
      throw err;
    }
    return await r.json();
  }

  async function fsDeleteDoc(docPath: string, bearerToken: string) {
    const r = await fetch(`${FIRESTORE_REST_BASE}/${docPath}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!r.ok && r.status !== 404) {
      const txt = await r.text();
      throw new Error(`Firestore DELETE ${docPath} failed (${r.status}): ${txt}`);
    }
  }

  const DAILY_XP_CAP = 250;

  const XP_ACTION_CONFIG: Record<string, { amount: number; cooldownSec: number; label: string }> = {
    post_create: { amount: 20, cooldownSec: 20, label: 'نشر منشور جديد' },
    comment_create: { amount: 8, cooldownSec: 10, label: 'إضافة تعليق' },
    repost_create: { amount: 10, cooldownSec: 15, label: 'إعادة نشر' },
    like_given: { amount: 3, cooldownSec: 4, label: 'تفاعل بإعجاب' },
    event_join: { amount: 12, cooldownSec: 30, label: 'المشاركة في فعالية' },
    room_message: { amount: 4, cooldownSec: 10, label: 'مشاركة في غرفة دردشة' },
    live_watch: { amount: 6, cooldownSec: 180, label: 'متابعة بث مباشر' },
    live_host: { amount: 15, cooldownSec: 300, label: 'تقديم بث مباشر' },
    daily_checkin: { amount: 15, cooldownSec: 20 * 3600, label: 'تسجيل الحضور اليومي' },
  };

  function getUtcDateInfo(now = new Date()) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const docSuffix = `${year}_${month}_${day}`;
    const nextResetAt = new Date(Date.UTC(year, now.getUTCMonth(), day + 1, 0, 0, 0, 0)).toISOString();
    return {
      year,
      month,
      day,
      dateKey,
      docSuffix,
      nowIso: now.toISOString(),
      nextResetAt,
    };
  }

  function computeServerLevelFromXp(xp: number): number {
    const safe = Math.max(0, Math.floor(xp));
    let lv = 1;
    while (lv < 100 && safe >= Math.round(100 * (lv + 1) * (lv + 1) * 0.45)) {
      lv += 1;
    }
    return lv;
  }

  app.get('/api/xp/status', async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const utc = getUtcDateInfo();
    const checkinId = `${authUser.uid}_${utc.docSuffix}`;

    try {
      const [userDoc, checkinDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`dailyCheckins/${checkinId}`, token).catch(() => null),
      ]);

      if (!userDoc) {
        res.status(404).json({ error: 'لم يتم العثور على الملف الشخصي.' });
        return;
      }

      const dailyXpEarned =
        userDoc.dailyXpDate === utc.dateKey ? Math.max(0, Number(userDoc.dailyXpEarned || 0)) : 0;
      const checkedInToday = Boolean(checkinDoc || userDoc.lastDailyCheckinDate === utc.dateKey);

      res.status(200).json({
        serverTime: utc.nowIso,
        utcDate: utc.dateKey,
        checkedInToday,
        nextResetAt: utc.nextResetAt,
        dailyXpEarned,
        dailyXpCap: DAILY_XP_CAP,
        xp: Math.max(0, Number(userDoc.xp || 0)),
        level: Math.max(1, Number(userDoc.level || 1)),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر جلب حالة الخبرة اليومية.' });
    }
  });

  app.post('/api/xp/award', express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const action = String((req.body || {}).action || '');
    const cfg = XP_ACTION_CONFIG[action];
    if (!cfg) {
      res.status(400).json({ error: 'نوع نشاط XP غير صالح.' });
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const utc = getUtcDateInfo(now);
    const checkinId = `${authUser.uid}_${utc.docSuffix}`;

    try {
      const userDoc = await fsGetDoc(`users/${authUser.uid}`, token);
      if (!userDoc) {
        res.status(404).json({ error: 'لم يتم العثور على الملف الشخصي.' });
        return;
      }

      const currentDayTotal =
        userDoc.dailyXpDate === utc.dateKey ? Math.max(0, Math.floor(Number(userDoc.dailyXpEarned || 0))) : 0;

      if (action === 'daily_checkin') {
        if (userDoc.lastDailyCheckinDate === utc.dateKey) {
          res.status(200).json({
            awarded: false,
            reason: 'already_claimed',
            checkedInToday: true,
            nextResetAt: utc.nextResetAt,
            dailyXpEarned: currentDayTotal,
            dailyXpCap: DAILY_XP_CAP,
          });
          return;
        }
        try {
          await fsCreateDoc(
            'dailyCheckins',
            checkinId,
            {
              id: checkinId,
              userId: authUser.uid,
              dateKey: utc.dateKey,
              amount: cfg.amount,
              createdAt: utc.nowIso,
            },
            token
          );
        } catch (checkinErr: any) {
          if (checkinErr?.status === 409 || String(checkinErr?.message || '').includes('ALREADY_EXISTS')) {
            res.status(200).json({
              awarded: false,
              reason: 'already_claimed',
              checkedInToday: true,
              nextResetAt: utc.nextResetAt,
              dailyXpEarned: currentDayTotal,
              dailyXpCap: DAILY_XP_CAP,
            });
            return;
          }
          throw checkinErr;
        }
      } else {
        const lastActionMap =
          userDoc.xpActionLastAt && typeof userDoc.xpActionLastAt === 'object'
            ? (userDoc.xpActionLastAt as Record<string, unknown>)
            : {};
        const lastIso = typeof lastActionMap[action] === 'string' ? (lastActionMap[action] as string) : '';
        const lastMs = lastIso ? new Date(lastIso).getTime() : 0;
        if (lastMs && nowMs - lastMs < cfg.cooldownSec * 1000) {
          res.status(200).json({
            awarded: false,
            reason: 'cooldown',
            dailyXpEarned: currentDayTotal,
            dailyXpCap: DAILY_XP_CAP,
          });
          return;
        }

        if (currentDayTotal + cfg.amount > DAILY_XP_CAP) {
          res.status(200).json({
            awarded: false,
            reason: 'daily_cap',
            dailyXpEarned: currentDayTotal,
            dailyXpCap: DAILY_XP_CAP,
          });
          return;
        }
      }

      const prevXp = Math.max(0, Math.floor(Number(userDoc.xp || 0)));
      const nextXp = prevXp + cfg.amount;
      const prevLevel = Math.max(1, Math.floor(Number(userDoc.level || 1)));
      const computedLevel = Math.max(prevLevel, computeServerLevelFromXp(nextXp));
      const boundedLevel = Math.min(computedLevel, prevLevel + 1);
      const nextDailyTotal =
        action === 'daily_checkin'
          ? Math.min(DAILY_XP_CAP, currentDayTotal + cfg.amount)
          : currentDayTotal + cfg.amount;

      const nextActionMap: Record<string, string> = {};
      if (userDoc.xpActionLastAt && typeof userDoc.xpActionLastAt === 'object') {
        for (const [k, v] of Object.entries(userDoc.xpActionLastAt)) {
          if (typeof v === 'string') nextActionMap[k] = v;
        }
      }
      nextActionMap[action] = utc.nowIso;

      const userPatch: Record<string, unknown> = {
        xp: nextXp,
        level: boundedLevel,
        dailyXpDate: utc.dateKey,
        dailyXpEarned: nextDailyTotal,
        xpActionLastAt: nextActionMap,
        lastActiveAt: utc.nowIso,
      };
      if (action === 'daily_checkin') {
        userPatch.lastDailyCheckinDate = utc.dateKey;
        userPatch.lastDailyCheckinAt = utc.nowIso;
      }

      await fsPatchDoc(`users/${authUser.uid}`, userPatch, token);

      const logId = `xp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'xpLogs',
        logId,
        {
          id: logId,
          userId: authUser.uid,
          action,
          amount: cfg.amount,
          label: cfg.label,
          createdAt: utc.nowIso,
        },
        token
      ).catch(() => {});

      res.status(200).json({
        awarded: true,
        xpDelta: cfg.amount,
        xp: nextXp,
        level: boundedLevel,
        checkedInToday: action === 'daily_checkin' ? true : Boolean(userDoc.lastDailyCheckinDate === utc.dateKey),
        nextResetAt: utc.nextResetAt,
        dailyXpEarned: nextDailyTotal,
        dailyXpCap: DAILY_XP_CAP,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر احتساب نقاط الخبرة.' });
    }
  });

  app.post('/api/admin/xp-adjust', express.json({ limit: '24kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const { targetUserId, delta, reason = '' } = (req.body || {}) as {
      targetUserId?: string;
      delta?: number;
      reason?: string;
    };

    const parsedDelta = Math.trunc(Number(delta));
    if (!targetUserId || !Number.isFinite(parsedDelta) || parsedDelta === 0 || Math.abs(parsedDelta) > 5000) {
      res.status(400).json({ error: 'قيمة تعديل XP غير صالحة (يجب أن تكون بين -5000 و +5000 ولا تساوي صفراً).' });
      return;
    }

    try {
      const [actorDoc, targetDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`users/${targetUserId}`, token),
      ]);

      if (!actorDoc || !targetDoc) {
        res.status(404).json({ error: 'تعذر العثور على الحساب المطلوب.' });
        return;
      }

      const actorRole = String(actorDoc.role || 'user');
      const targetRole = String(targetDoc.role || 'user');
      const canAdjust =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        hasActorGlobalPerm(actorDoc, 'manageUsers');

      if (!canAdjust) {
        res.status(403).json({ error: 'ليست لديك صلاحية تعديل نقاط الخبرة.' });
        return;
      }

      if (targetRole === 'owner' && authUser.uid !== targetUserId) {
        res.status(403).json({ error: 'لا يمكن تعديل نقاط حساب مؤسس المنصة.' });
        return;
      }

      const prevXp = Math.max(0, Math.floor(Number(targetDoc.xp || 0)));
      const nextXp = Math.max(0, prevXp + parsedDelta);
      const nextLevel = Math.max(1, computeServerLevelFromXp(nextXp));
      const nowIso = new Date().toISOString();

      await fsPatchDoc(
        `users/${targetUserId}`,
        {
          xp: nextXp,
          level: nextLevel,
        },
        token
      );

      const cleanReason = String(reason || '').trim().slice(0, 200);
      const logId = `xp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'xpLogs',
        logId,
        {
          id: logId,
          userId: targetUserId,
          action: 'admin_adjust',
          amount: parsedDelta,
          label: cleanReason ? `تعديل إداري: ${cleanReason}` : 'تعديل إداري لنقاط الخبرة',
          createdAt: nowIso,
        },
        token
      ).catch(() => {});

      const auditId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'audit_logs',
        auditId,
        {
          id: auditId,
          actorId: authUser.uid,
          actorName: String(actorDoc.displayName || 'Admin'),
          actorRole,
          actionType: 'xp_adjust',
          targetType: 'user',
          targetId: targetUserId,
          targetDetails: `Adjusted XP by ${parsedDelta > 0 ? `+${parsedDelta}` : parsedDelta} (${prevXp} -> ${nextXp}, Lv ${nextLevel})`,
          reason: cleanReason,
          createdAt: nowIso,
        },
        token
      ).catch(() => {});

      res.status(200).json({ ok: true, xp: nextXp, level: nextLevel });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر تعديل نقاط الخبرة.' });
    }
  });

  const GLOBAL_PERM_KEYS = [
    'manageUsers',
    'manageRoles',
    'manageTitles',
    'manageEvents',
    'manageAnnouncements',
    'manageAds',
    'manageVerifications',
    'manageRooms',
    'manageWiki',
    'manageStickers',
    'manageLive',
    'viewAuditLogs',
  ] as const;

  function hasActorGlobalPerm(actorDoc: Record<string, any> | null, permKey: string): boolean {
    if (!actorDoc) return false;
    const role = String(actorDoc.role || 'user');
    if (role === 'owner' || role === 'admin') return true;
    const perms = actorDoc.globalPermissions;
    if (perms && typeof perms === 'object' && perms[permKey] === true) return true;
    return false;
  }

  function sanitizePermissionsMap(raw: unknown): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of GLOBAL_PERM_KEYS) {
      if ((raw as Record<string, unknown>)[k] === true) out[k] = true;
    }
    return out;
  }

  function sanitizeRoomPermissions(raw: unknown): Record<string, boolean> {
    const allowed = [
      'deleteMessages',
      'pinMessages',
      'muteMembers',
      'kickMembers',
      'banMembers',
      'manageAnnouncements',
      'manageAppearance',
      'inviteMembers',
    ];
    const out: Record<string, boolean> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of allowed) {
      if ((raw as Record<string, unknown>)[k] === true) out[k] = true;
    }
    return out;
  }

  app.post('/api/moderation/profile-action', express.json({ limit: '48kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول لإجراء هذه الصلاحية.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const {
      targetUserId,
      action,
      reason = '',
      newRole,
      durationHours = 24,
      customTitle,
      titleId,
      roomId,
    } = (req.body || {}) as {
      targetUserId?: string;
      action?: string;
      reason?: string;
      newRole?: string;
      durationHours?: number;
      customTitle?: {
        id?: string;
        text?: string;
        color?: string;
        bgColor?: string;
        borderColor?: string;
        gradient?: string;
        icon?: string;
        shape?: string;
        priority?: number;
      } | null;
      titleId?: string;
      roomId?: string;
    };

    if (!targetUserId || !action) {
      res.status(400).json({ error: 'بيانات الإجراء غير مكتملة.' });
      return;
    }

    try {
      const [actorDoc, targetDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`users/${targetUserId}`, token),
      ]);

      if (!actorDoc || !targetDoc) {
        res.status(404).json({ error: 'تعذر العثور على الحساب المطلوب.' });
        return;
      }

      const actorRole = String(actorDoc.role || 'user');
      const targetRole = String(targetDoc.role || 'user');
      const actorRank = ROLE_RANK_MAP[actorRole] || 1;
      const targetRank = ROLE_RANK_MAP[targetRole] || 1;

      const isCosmeticTitle = action === 'grant_title' || action === 'revoke_title';
      const canManageTitles = isCosmeticTitle && (actorRank >= ROLE_RANK_MAP.assistant_admin || hasActorGlobalPerm(actorDoc, 'manageTitles'));
      const canManageUsers = actorRank >= ROLE_RANK_MAP.moderator || hasActorGlobalPerm(actorDoc, 'manageUsers');

      if (!canManageUsers && !canManageTitles) {
        res.status(403).json({ error: 'ليست لديك صلاحية تنفيذ إجراءات إدارية.' });
        return;
      }

      if (targetRole === 'owner' && authUser.uid !== targetUserId) {
        res.status(403).json({ error: 'لا يمكن تعديل أو تقييد حساب مؤسس المنصة.' });
        return;
      }

      if (authUser.uid === targetUserId && !(canManageTitles && isCosmeticTitle)) {
        res.status(403).json({ error: 'لا يمكنك ترقية أو تطبيق عقوبة على حسابك الشخصي.' });
        return;
      }

      if (authUser.uid !== targetUserId && actorRank <= targetRank && actorRole !== 'owner' && !canManageTitles) {
        res.status(403).json({ error: 'لا تملك رتبة أعلى من العضو المستهدف لتنفيذ هذا الإجراء.' });
        return;
      }

      const now = new Date().toISOString();
      const userPatch: Record<string, unknown> = {};
      let auditActionType = 'user_warn';
      let auditTargetType = 'user';
      let auditTargetId = targetUserId;
      let auditDetails = '';
      let notifMessage = '';
      let notifType = 'moderation';

      const existingTitlesRaw: Array<Record<string, any>> = Array.isArray(targetDoc.customTitles) && targetDoc.customTitles.length > 0
        ? targetDoc.customTitles
        : targetDoc.customTitle && targetDoc.customTitle.text
        ? [targetDoc.customTitle]
        : [];

      if (action === 'grant_title') {
        if (!canManageTitles) {
          res.status(403).json({ error: 'صلاحية منح الألقاب مقتصرة على الإدارة والمسؤولين المخوّلين.' });
          return;
        }
        const titleText = String(customTitle?.text || '').trim().slice(0, 32);
        if (!titleText) {
          res.status(400).json({ error: 'يرجى كتابة نص اللقب.' });
          return;
        }
        const resolvedId = String(customTitle?.id || `ut_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`);
        const newEntry: Record<string, unknown> = {
          id: resolvedId,
          text: titleText,
          color: String(customTitle?.color || '#3B6DFF'),
          icon: String(customTitle?.icon || 'Award'),
          shape: String(customTitle?.shape || 'tag'),
          priority: Number.isFinite(Number(customTitle?.priority)) ? Number(customTitle?.priority) : existingTitlesRaw.length + 1,
          grantedBy: authUser.uid,
          grantedByName: String(actorDoc.displayName || 'Admin'),
          grantedAt: now,
        };
        if (customTitle?.bgColor) newEntry.bgColor = String(customTitle.bgColor);
        if (customTitle?.borderColor) newEntry.borderColor = String(customTitle.borderColor);
        if (customTitle?.gradient) newEntry.gradient = String(customTitle.gradient);

        const nextTitles = [
          ...existingTitlesRaw.filter((item) => item && item.id !== resolvedId && item.text !== titleText),
          newEntry,
        ]
          .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
          .slice(0, 12);

        userPatch.customTitles = nextTitles;
        userPatch.customTitle = nextTitles[0] || null;
        auditActionType = 'title_grant';
        auditDetails = `Granted cosmetic title "${titleText}"`;
        notifType = 'title';
        notifMessage = `تم منحك اللقب المخصص "${titleText}" في منصة Q.`;
      } else if (action === 'revoke_title') {
        if (!canManageTitles) {
          res.status(403).json({ error: 'صلاحية سحب الألقاب مقتصرة على الإدارة.' });
          return;
        }
        if (titleId) {
          const nextTitles = existingTitlesRaw.filter((item) => item?.id !== titleId && item?.text !== titleId);
          userPatch.customTitles = nextTitles;
          userPatch.customTitle = nextTitles[0] || null;
          auditDetails = `Revoked cosmetic title ${titleId}`;
          notifMessage = 'تمت إزالة أحد الألقاب المخصصة من حسابك بواسطة الإدارة.';
        } else {
          userPatch.customTitles = [];
          userPatch.customTitle = null;
          auditDetails = 'Revoked all custom titles';
          notifMessage = 'تمت إزالة الألقاب المخصصة من حسابك بواسطة الإدارة.';
        }
        auditActionType = 'title_revoke';
        notifType = 'title';
      } else if (action === 'restrict') {
        const untilIso = new Date(Date.now() + Math.max(1, Number(durationHours || 24)) * 3600 * 1000).toISOString();
        userPatch.isRestricted = true;
        userPatch.restrictedUntil = untilIso;
        userPatch.restrictionReason = reason || 'مخالفة ضوابط النشر والتفاعل';
        auditActionType = 'user_restrict';
        auditDetails = `Restricted user until ${untilIso}`;
        notifMessage = `تم تقييد التفاعل على حسابك مؤقتاً. السبب: ${userPatch.restrictionReason}`;
      } else if (action === 'unrestrict') {
        userPatch.isRestricted = false;
        userPatch.restrictedUntil = '';
        userPatch.restrictionReason = '';
        auditActionType = 'user_unrestrict';
        auditDetails = 'Lifted user interaction restriction';
        notifMessage = 'تم رفع التقييد المؤقت عن حسابك.';
      } else if (action === 'warn') {
        userPatch.warningCount = Number(targetDoc.warningCount || 0) + 1;
        auditActionType = 'user_warn';
        auditDetails = `Issued warning #${userPatch.warningCount}: ${reason}`;
        notifMessage = `تم توجيه إنذار لحسابك: ${reason || 'مخالفة الضوابط العامة'}`;
      } else if (action === 'suspend') {
        if (actorRank < ROLE_RANK_MAP.assistant_admin && !hasActorGlobalPerm(actorDoc, 'manageUsers')) {
          res.status(403).json({ error: 'صلاحية تعليق الحساب تتطلب رتبة مساعد إدمن أو صلاحية إدارة المستخدمين.' });
          return;
        }
        userPatch.isSuspended = true;
        userPatch.suspensionReason = reason || 'تعليق إداري مؤقت';
        auditActionType = 'user_suspend';
        auditDetails = `Suspended account: ${userPatch.suspensionReason}`;
        notifMessage = `تم تعليق حسابك: ${userPatch.suspensionReason}`;
      } else if (action === 'ban') {
        if (actorRank < ROLE_RANK_MAP.admin && !hasActorGlobalPerm(actorDoc, 'manageUsers')) {
          res.status(403).json({ error: 'صلاحية الحظر الدائم تتطلب رتبة إدمن أو مؤسس.' });
          return;
        }
        userPatch.isBanned = true;
        userPatch.bannedReason = reason || 'حظر دائم لمخالفة جسيمة';
        auditActionType = 'user_ban';
        auditDetails = `Banned account: ${userPatch.bannedReason}`;
        notifMessage = `تم حظر حسابك من المنصة: ${userPatch.bannedReason}`;
      } else if (action === 'unban') {
        if (actorRank < ROLE_RANK_MAP.assistant_admin && !hasActorGlobalPerm(actorDoc, 'manageUsers')) {
          res.status(403).json({ error: 'صلاحية فك الحظر تتطلب رتبة مساعد إدمن أو أعلى.' });
          return;
        }
        userPatch.isBanned = false;
        userPatch.isSuspended = false;
        userPatch.isRestricted = false;
        userPatch.bannedReason = '';
        userPatch.suspensionReason = '';
        userPatch.restrictionReason = '';
        userPatch.restrictedUntil = '';
        auditActionType = 'user_restore';
        auditDetails = 'Restored account and removed ban/suspension';
        notifMessage = 'تم رفع الحظر واستعادة حسابك في منصة Q.';
      } else if (
        action === 'change_role' ||
        action === 'appoint_room_leader' ||
        action === 'appoint_moderator' ||
        action === 'remove_staff'
      ) {
        const resolvedRole =
          action === 'appoint_room_leader'
            ? 'room_leader'
            : action === 'appoint_moderator'
            ? 'moderator'
            : action === 'remove_staff'
            ? 'user'
            : String(newRole || '');

        const resolvedRank = ROLE_RANK_MAP[resolvedRole] || 0;
        if (!resolvedRank || resolvedRole === 'owner') {
          res.status(400).json({ error: 'الرتبة المطلوبة غير صالحة.' });
          return;
        }
        if (actorRank <= resolvedRank && actorRole !== 'owner') {
          res.status(403).json({ error: 'لا يمكنك منح رتبة مساوية لرتبتك أو أعلى منها.' });
          return;
        }
        if (actorRank < ROLE_RANK_MAP.assistant_admin && !hasActorGlobalPerm(actorDoc, 'manageRoles')) {
          res.status(403).json({ error: 'ليست لديك صلاحية تعديل الرتب الإدارية.' });
          return;
        }

        userPatch.role = resolvedRole;
        if (resolvedRole === 'user') {
          userPatch.customRoleId = '';
          userPatch.customRoleName = '';
          userPatch.globalPermissions = {};
        }
        auditActionType = 'role_change';
        auditDetails = `Changed role from ${targetRole} to ${resolvedRole}`;
        notifMessage = `تم تحديث رتبتك الإدارية في منصة Q إلى: ${resolvedRole}`;
      } else if (action === 'kick_from_room') {
        if (!roomId) {
          res.status(400).json({ error: 'يرجى تحديد الغرفة المطلوب الطرد منها.' });
          return;
        }
        const roomDoc = await fsGetDoc(`chatRooms/${roomId}`, token);
        if (!roomDoc) {
          res.status(404).json({ error: 'الغرفة غير موجودة.' });
          return;
        }
        await fsDeleteDoc(`chatRooms/${roomId}/members/${targetUserId}`, token).catch(() => {});
        const currentBanned = Array.isArray(roomDoc.bannedUserIds) ? roomDoc.bannedUserIds : [];
        const currentLeaders = Array.isArray(roomDoc.leaderIds) ? roomDoc.leaderIds : [];
        const currentMods = Array.isArray(roomDoc.moderatorIds) ? roomDoc.moderatorIds : [];
        const currentDeputies = Array.isArray(roomDoc.deputyIds) ? roomDoc.deputyIds : [];
        await fsPatchDoc(
          `chatRooms/${roomId}`,
          {
            bannedUserIds: Array.from(new Set([...currentBanned, targetUserId])),
            leaderIds: currentLeaders.filter((id: string) => id !== targetUserId),
            moderatorIds: currentMods.filter((id: string) => id !== targetUserId),
            deputyIds: currentDeputies.filter((id: string) => id !== targetUserId),
            memberCount: Math.max(0, Number(roomDoc.memberCount || 1) - 1),
            updatedAt: now,
          },
          token
        );
        auditActionType = 'room_kick';
        auditTargetType = 'room';
        auditTargetId = roomId;
        auditDetails = `Kicked & banned ${targetUserId} from room "${roomDoc.title || roomId}"`;
        notifMessage = `تمت إزالتك من غرفة الدردشة "${roomDoc.title || ''}".`;
      } else {
        res.status(400).json({ error: 'إجراء غير معروف.' });
        return;
      }

      if (Object.keys(userPatch).length > 0) {
        await fsPatchDoc(`users/${targetUserId}`, userPatch, token);
      }

      const logId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'audit_logs',
        logId,
        {
          id: logId,
          actorId: authUser.uid,
          actorName: String(actorDoc.displayName || 'Staff'),
          actorRole,
          actionType: auditActionType,
          targetType: auditTargetType,
          targetId: auditTargetId,
          targetDetails: auditDetails,
          reason: reason || '',
          createdAt: now,
        },
        token
      ).catch(() => {});

      if (notifMessage && targetUserId !== authUser.uid) {
        const notifId = `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await fsCreateDoc(
          'notifications',
          notifId,
          {
            id: notifId,
            recipientId: targetUserId,
            senderId: authUser.uid,
            senderName: String(actorDoc.displayName || 'إدارة Q'),
            senderPhotoURL: String(actorDoc.photoURL || ''),
            type: notifType,
            targetId: auditTargetId,
            message: notifMessage.slice(0, 290),
            read: false,
            createdAt: now,
          },
          token
        ).catch(() => {});
      }

      res.status(200).json({ ok: true, message: auditDetails });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'فشل تنفيذ الإجراء الإداري.' });
    }
  });

  app.post('/api/admin/roles', express.json({ limit: '48kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول لإدارة الرتب والصلاحيات.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const {
      operation,
      roleId,
      name,
      description = '',
      color = '#3B6DFF',
      permissions,
      targetUserId,
      baseRole,
    } = (req.body || {}) as {
      operation?: 'create_role' | 'update_role' | 'delete_role' | 'assign_user_role';
      roleId?: string;
      name?: string;
      description?: string;
      color?: string;
      permissions?: Record<string, boolean>;
      targetUserId?: string;
      baseRole?: string;
    };

    try {
      const actorDoc = await fsGetDoc(`users/${authUser.uid}`, token);
      if (!actorDoc) {
        res.status(404).json({ error: 'لم يتم العثور على حسابك.' });
        return;
      }

      const actorRole = String(actorDoc.role || 'user');
      const isOwnerActor =
        actorRole === 'owner' ||
        authUser.email === 'sabosenpai33@gmail.com' ||
        hasActorGlobalPerm(actorDoc, 'manageRoles');

      if (!isOwnerActor) {
        res.status(403).json({ error: 'فقط مالك المنصة أو المفوض بصلاحية إدارة الرتب يمكنه التعديل.' });
        return;
      }

      const now = new Date().toISOString();

      if (operation === 'create_role') {
        const cleanName = String(name || '').trim().slice(0, 50);
        if (!cleanName) {
          res.status(400).json({ error: 'اسم الرتبة مطلوب.' });
          return;
        }
        const newRoleId = `grole_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
        const perms = sanitizePermissionsMap(permissions);
        const roleDoc = {
          id: newRoleId,
          name: cleanName,
          description: String(description || '').trim().slice(0, 200),
          color: String(color || '#3B6DFF'),
          permissions: perms,
          createdBy: authUser.uid,
          createdByName: String(actorDoc.displayName || 'Owner'),
          createdAt: now,
          updatedAt: now,
        };
        await fsCreateDoc('globalAdminRoles', newRoleId, roleDoc, token);
        res.status(200).json({ ok: true, role: roleDoc });
        return;
      }

      if (operation === 'update_role') {
        if (!roleId) {
          res.status(400).json({ error: 'معرف الرتبة مطلوب.' });
          return;
        }
        const patch: Record<string, unknown> = { updatedAt: now };
        if (name && name.trim()) patch.name = name.trim().slice(0, 50);
        if (description !== undefined) patch.description = String(description).trim().slice(0, 200);
        if (color) patch.color = String(color);
        if (permissions) patch.permissions = sanitizePermissionsMap(permissions);
        await fsPatchDoc(`globalAdminRoles/${roleId}`, patch, token);
        res.status(200).json({ ok: true });
        return;
      }

      if (operation === 'delete_role') {
        if (!roleId) {
          res.status(400).json({ error: 'معرف الرتبة مطلوب.' });
          return;
        }
        await fsDeleteDoc(`globalAdminRoles/${roleId}`, token);
        res.status(200).json({ ok: true });
        return;
      }

      if (operation === 'assign_user_role') {
        if (!targetUserId) {
          res.status(400).json({ error: 'يرجى تحديد الحساب المستهدف.' });
          return;
        }
        const targetDoc = await fsGetDoc(`users/${targetUserId}`, token);
        if (!targetDoc) {
          res.status(404).json({ error: 'الحساب المستهدف غير موجود.' });
          return;
        }
        if (String(targetDoc.role) === 'owner' && targetUserId !== authUser.uid) {
          res.status(403).json({ error: 'لا يمكن تغيير صلاحيات مؤسس المنصة.' });
          return;
        }

        const perms = sanitizePermissionsMap(permissions);
        const userPatch: Record<string, unknown> = {
          customRoleId: roleId || '',
          customRoleName: name ? String(name).trim().slice(0, 50) : '',
          globalPermissions: perms,
        };
        if (baseRole && ['user', 'moderator', 'room_leader', 'assistant_admin', 'admin'].includes(baseRole)) {
          userPatch.role = baseRole;
        } else if (Object.keys(perms).length > 0 && String(targetDoc.role || 'user') === 'user') {
          userPatch.role = 'moderator';
        }
        await fsPatchDoc(`users/${targetUserId}`, userPatch, token);

        const logId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await fsCreateDoc(
          'audit_logs',
          logId,
          {
            id: logId,
            actorId: authUser.uid,
            actorName: String(actorDoc.displayName || 'Owner'),
            actorRole,
            actionType: 'role_change',
            targetType: 'role',
            targetId: targetUserId,
            targetDetails: `Assigned custom role "${userPatch.customRoleName || baseRole || 'staff'}" with ${Object.keys(perms).length} permissions`,
            createdAt: now,
          },
          token
        ).catch(() => {});

        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'عملية غير معروفة.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'فشل إدارة الرتب والصلاحيات.' });
    }
  });

  app.post('/api/admin/broadcasts', express.json({ limit: '48kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول للنشر الإداري.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const {
      kind,
      operation,
      id,
      title,
      content,
      bannerURL = '',
      mediaURL = '',
      ctaLabel = '',
      targetUrl = '',
      sponsorName = '',
      isPaused = false,
      playSound = true,
      publishAt,
      expiresAt = '',
      notifyUserIds = [],
    } = (req.body || {}) as {
      kind?: 'announcement' | 'ad';
      operation?: 'create' | 'update' | 'toggle_pause' | 'delete';
      id?: string;
      title?: string;
      content?: string;
      bannerURL?: string;
      mediaURL?: string;
      ctaLabel?: string;
      targetUrl?: string;
      sponsorName?: string;
      isPaused?: boolean;
      playSound?: boolean;
      publishAt?: string;
      expiresAt?: string;
      notifyUserIds?: string[];
    };

    if (!kind || !operation) {
      res.status(400).json({ error: 'بيانات الطلب ناقصة.' });
      return;
    }

    try {
      const actorDoc = await fsGetDoc(`users/${authUser.uid}`, token);
      if (!actorDoc) {
        res.status(404).json({ error: 'الحساب غير موجود.' });
        return;
      }
      const permNeeded = kind === 'ad' ? 'manageAds' : 'manageAnnouncements';
      const actorRole = String(actorDoc.role || 'user');
      const allowed =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        actorRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, permNeeded);
      if (!allowed) {
        res.status(403).json({ error: 'ليست لديك صلاحية إدارة الإعلانات والبيانات الرسمية.' });
        return;
      }

      const col = kind === 'ad' ? 'platformAds' : 'platformAnnouncements';
      const now = new Date().toISOString();

      if (operation === 'create') {
        const cleanTitle = String(title || '').trim().slice(0, 140);
        const cleanContent = String(content || '').trim().slice(0, 2000);
        if (!cleanTitle || !cleanContent) {
          res.status(400).json({ error: 'العنوان والمحتوى مطلوبان.' });
          return;
        }
        const docId = `${kind === 'ad' ? 'ad' : 'ann'}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
        const docData: Record<string, unknown> =
          kind === 'ad'
            ? {
                id: docId,
                title: cleanTitle,
                content: cleanContent,
                mediaURL: String(mediaURL || '').trim(),
                ctaLabel: String(ctaLabel || '').trim().slice(0, 40),
                targetUrl: String(targetUrl || '').trim(),
                sponsorName: String(sponsorName || '').trim().slice(0, 80),
                isPaused: Boolean(isPaused),
                publishAt: publishAt || now,
                expiresAt: expiresAt || '',
                createdBy: authUser.uid,
                createdByName: String(actorDoc.displayName || 'إدارة Q'),
                createdAt: now,
                updatedAt: now,
              }
            : {
                id: docId,
                title: cleanTitle,
                content: cleanContent,
                bannerURL: String(bannerURL || '').trim(),
                targetUrl: String(targetUrl || '').trim(),
                isPaused: Boolean(isPaused),
                playSound: Boolean(playSound),
                publishAt: publishAt || now,
                expiresAt: expiresAt || '',
                createdBy: authUser.uid,
                createdByName: String(actorDoc.displayName || 'إدارة Q'),
                createdAt: now,
                updatedAt: now,
              };

        await fsCreateDoc(col, docId, docData, token);

        const logId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await fsCreateDoc(
          'audit_logs',
          logId,
          {
            id: logId,
            actorId: authUser.uid,
            actorName: String(actorDoc.displayName || 'Staff'),
            actorRole,
            actionType: kind === 'ad' ? 'ad_publish' : 'announcement_publish',
            targetType: kind === 'ad' ? 'ad' : 'announcement',
            targetId: docId,
            targetDetails: `Published ${kind}: ${cleanTitle}`,
            createdAt: now,
          },
          token
        ).catch(() => {});

        if (kind === 'announcement' && Array.isArray(notifyUserIds) && notifyUserIds.length > 0 && !isPaused) {
          const targets = Array.from(new Set(notifyUserIds)).filter((u) => u && u !== authUser.uid).slice(0, 60);
          await Promise.allSettled(
            targets.map((rid) => {
              const nid = `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
              return fsCreateDoc(
                'notifications',
                nid,
                {
                  id: nid,
                  recipientId: rid,
                  senderId: authUser.uid,
                  senderName: 'إدارة منصة Q',
                  senderPhotoURL: String(actorDoc.photoURL || ''),
                  type: 'announcement',
                  targetId: docId,
                  message: `إعلان رسمي: ${cleanTitle}`.slice(0, 260),
                  read: false,
                  createdAt: now,
                },
                token
              );
            })
          );
        }

        res.status(200).json({ ok: true, id: docId });
        return;
      }

      if (!id) {
        res.status(400).json({ error: 'معرف العنصر مطلوب.' });
        return;
      }

      if (operation === 'toggle_pause') {
        await fsPatchDoc(`${col}/${id}`, { isPaused: Boolean(isPaused), updatedAt: now }, token);
        res.status(200).json({ ok: true });
        return;
      }

      if (operation === 'update') {
        const patch: Record<string, unknown> = { updatedAt: now };
        if (title !== undefined) patch.title = String(title).trim().slice(0, 140);
        if (content !== undefined) patch.content = String(content).trim().slice(0, 2000);
        if (targetUrl !== undefined) patch.targetUrl = String(targetUrl).trim();
        if (publishAt !== undefined) patch.publishAt = publishAt;
        if (expiresAt !== undefined) patch.expiresAt = expiresAt;
        if (kind === 'ad') {
          if (mediaURL !== undefined) patch.mediaURL = String(mediaURL).trim();
          if (ctaLabel !== undefined) patch.ctaLabel = String(ctaLabel).trim().slice(0, 40);
          if (sponsorName !== undefined) patch.sponsorName = String(sponsorName).trim().slice(0, 80);
        } else {
          if (bannerURL !== undefined) patch.bannerURL = String(bannerURL).trim();
          if (playSound !== undefined) patch.playSound = Boolean(playSound);
        }
        await fsPatchDoc(`${col}/${id}`, patch, token);
        res.status(200).json({ ok: true });
        return;
      }

      if (operation === 'delete') {
        await fsDeleteDoc(`${col}/${id}`, token);
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'عملية غير مدعومة.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'فشل حفظ البيانات الإدارية.' });
    }
  });

  app.post('/api/rooms/moderate', express.json({ limit: '48kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول لإدارة الغرفة.' });
      return;
    }

    const token = String(req.headers.authorization || '').slice(7).trim();
    const {
      roomId,
      action,
      targetUserId,
      targetUserName = '',
      messageId,
      announcementId,
      title,
      content,
      imageURL,
      reason = '',
      permissions,
      appearance,
    } = (req.body || {}) as {
      roomId?: string;
      action?: string;
      targetUserId?: string;
      targetUserName?: string;
      messageId?: string;
      announcementId?: string;
      title?: string;
      content?: string;
      imageURL?: string;
      reason?: string;
      permissions?: Record<string, boolean>;
      appearance?: {
        bgColor?: string;
        bgPresetId?: string;
        bgImageURL?: string;
        bgScrimOpacity?: number;
        accentColor?: string;
        bubbleTheme?: string;
        imageURL?: string;
        coverURL?: string;
        title?: string;
        description?: string;
      };
    };

    if (!roomId || !action) {
      res.status(400).json({ error: 'بيانات الغرفة أو الإجراء ناقصة.' });
      return;
    }

    try {
      const [actorDoc, roomDoc, actorMemberDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`chatRooms/${roomId}`, token),
        fsGetDoc(`chatRooms/${roomId}/members/${authUser.uid}`, token),
      ]);

      if (!actorDoc || !roomDoc) {
        res.status(404).json({ error: 'الغرفة أو الحساب غير موجود.' });
        return;
      }

      const globalRole = String(actorDoc.role || 'user');
      const isPlatformAdmin =
        globalRole === 'owner' ||
        globalRole === 'admin' ||
        globalRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, 'manageRooms');

      const isRoomOwner = roomDoc.ownerId === authUser.uid;
      const leaders: string[] = Array.isArray(roomDoc.leaderIds) ? roomDoc.leaderIds : [];
      const mods: string[] = Array.isArray(roomDoc.moderatorIds) ? roomDoc.moderatorIds : [];
      const deputies: string[] = Array.isArray(roomDoc.deputyIds) ? roomDoc.deputyIds : [];
      const isModerator = mods.includes(authUser.uid) || leaders.includes(authUser.uid);
      const isDeputy = deputies.includes(authUser.uid) || actorMemberDoc?.role === 'deputy_moderator';
      const deputyPerms = (actorMemberDoc?.permissions || {}) as Record<string, boolean>;

      const hasRoomPerm = (perm: string): boolean => {
        if (isPlatformAdmin || isRoomOwner || isModerator) return true;
        if (isDeputy && deputyPerms[perm] === true) return true;
        return false;
      };

      const now = new Date().toISOString();
      let logSummary = '';

      if (action === 'appoint_moderator' || action === 'appoint_deputy' || action === 'update_deputy_permissions' || action === 'demote_member' || action === 'transfer_ownership') {
        if (!isPlatformAdmin && !isRoomOwner && !(isModerator && action !== 'transfer_ownership' && action !== 'appoint_moderator')) {
          res.status(403).json({ error: 'هذه الصلاحية مخصصة لمالك الغرفة أو مشرفيها المخوّلين.' });
          return;
        }
        if (!targetUserId) {
          res.status(400).json({ error: 'يرجى تحديد العضو المستهدف.' });
          return;
        }
        if (targetUserId === roomDoc.ownerId && !isPlatformAdmin) {
          res.status(403).json({ error: 'لا يمكن تعديل دور مالك الغرفة الحالي.' });
          return;
        }

        if (action === 'transfer_ownership') {
          if (!isRoomOwner && !isPlatformAdmin) {
            res.status(403).json({ error: 'فقط مالك الغرفة أو إدارة المنصة يمكنه نقل الملكية.' });
            return;
          }
          const newOwnerName = targetUserName || 'عضو';
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              ownerId: targetUserId,
              ownerName: newOwnerName,
              leaderIds: Array.from(new Set([targetUserId, ...leaders.filter((id) => id !== targetUserId)])),
              moderatorIds: mods.filter((id) => id !== targetUserId),
              deputyIds: deputies.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}/members/${targetUserId}`, { role: 'owner' }, token).catch(() => {});
          if (roomDoc.ownerId && roomDoc.ownerId !== targetUserId) {
            await fsPatchDoc(`chatRooms/${roomId}/members/${roomDoc.ownerId}`, { role: 'moderator' }, token).catch(() => {});
          }
          logSummary = `transferred_ownership_to:${targetUserId}`;
        } else if (action === 'appoint_moderator') {
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              moderatorIds: Array.from(new Set([...mods, targetUserId])),
              deputyIds: deputies.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}/members/${targetUserId}`, { role: 'moderator', permissions: {} }, token).catch(() => {});
          logSummary = `appoint_moderator:${targetUserId}`;
        } else if (action === 'appoint_deputy' || action === 'update_deputy_permissions') {
          const cleanPerms = sanitizeRoomPermissions(permissions);
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              deputyIds: Array.from(new Set([...deputies, targetUserId])),
              moderatorIds: mods.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
          await fsPatchDoc(
            `chatRooms/${roomId}/members/${targetUserId}`,
            { role: 'deputy_moderator', permissions: cleanPerms },
            token
          ).catch(() => {});
          logSummary = `${action}:${targetUserId}`;
        } else {
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              leaderIds: leaders.filter((id) => id !== targetUserId && id !== roomDoc.ownerId),
              moderatorIds: mods.filter((id) => id !== targetUserId),
              deputyIds: deputies.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}/members/${targetUserId}`, { role: 'member', permissions: {} }, token).catch(() => {});
          logSummary = `demote_member:${targetUserId}`;
        }
      } else if (action === 'kick' || action === 'ban' || action === 'unban' || action === 'mute_member' || action === 'unmute_member') {
        if (!targetUserId) {
          res.status(400).json({ error: 'يرجى تحديد العضو.' });
          return;
        }
        if (targetUserId === roomDoc.ownerId) {
          res.status(403).json({ error: 'لا يمكن معاقبة مالك الغرفة.' });
          return;
        }
        const permRequired =
          action === 'ban' || action === 'unban'
            ? 'banMembers'
            : action === 'kick'
            ? 'kickMembers'
            : 'muteMembers';
        if (!hasRoomPerm(permRequired)) {
          res.status(403).json({ error: 'ليست لديك صلاحية تنفيذ هذا الإجراء في الغرفة.' });
          return;
        }
        const currentBanned: string[] = Array.isArray(roomDoc.bannedUserIds) ? roomDoc.bannedUserIds : [];
        const currentMuted: string[] = Array.isArray(roomDoc.mutedUserIds) ? roomDoc.mutedUserIds : [];
        const allowedUsers: string[] = Array.isArray(roomDoc.allowedUserIds) ? roomDoc.allowedUserIds : [];

        if (action === 'kick') {
          await fsDeleteDoc(`chatRooms/${roomId}/members/${targetUserId}`, token).catch(() => {});
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              memberCount: Math.max(0, Number(roomDoc.memberCount || 1) - 1),
              leaderIds: leaders.filter((id) => id !== targetUserId),
              moderatorIds: mods.filter((id) => id !== targetUserId),
              deputyIds: deputies.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
        } else if (action === 'ban') {
          await fsDeleteDoc(`chatRooms/${roomId}/members/${targetUserId}`, token).catch(() => {});
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              memberCount: Math.max(0, Number(roomDoc.memberCount || 1) - 1),
              bannedUserIds: Array.from(new Set([...currentBanned, targetUserId])),
              allowedUserIds: allowedUsers.filter((id) => id !== targetUserId),
              leaderIds: leaders.filter((id) => id !== targetUserId),
              moderatorIds: mods.filter((id) => id !== targetUserId),
              deputyIds: deputies.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
        } else if (action === 'unban') {
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            {
              bannedUserIds: currentBanned.filter((id) => id !== targetUserId),
              updatedAt: now,
            },
            token
          );
        } else if (action === 'mute_member') {
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            { mutedUserIds: Array.from(new Set([...currentMuted, targetUserId])), updatedAt: now },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}/members/${targetUserId}`, { isMuted: true }, token).catch(() => {});
        } else if (action === 'unmute_member') {
          await fsPatchDoc(
            `chatRooms/${roomId}`,
            { mutedUserIds: currentMuted.filter((id) => id !== targetUserId), updatedAt: now },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}/members/${targetUserId}`, { isMuted: false }, token).catch(() => {});
        }
        logSummary = `${action}:${targetUserId}`;
      } else if (action === 'pin_message' || action === 'unpin_message' || action === 'mod_delete_message') {
        if (!messageId) {
          res.status(400).json({ error: 'معرف الرسالة مطلوب.' });
          return;
        }
        const permRequired = action === 'mod_delete_message' ? 'deleteMessages' : 'pinMessages';
        if (!hasRoomPerm(permRequired)) {
          res.status(403).json({ error: 'ليست لديك صلاحية إدارة رسائل الغرفة.' });
          return;
        }
        if (action === 'mod_delete_message') {
          await fsPatchDoc(
            `chatRooms/${roomId}/messages/${messageId}`,
            {
              text: '',
              mediaURL: '',
              audioURL: '',
              isDeleted: true,
              deletedBy: authUser.uid,
              deletedByName: String(actorDoc.displayName || 'مشرف'),
            },
            token
          );
        } else {
          const isPin = action === 'pin_message';
          const pinnedIds: string[] = Array.isArray(roomDoc.pinnedMessageIds) ? roomDoc.pinnedMessageIds : [];
          const nextPinnedIds = isPin
            ? Array.from(new Set([...pinnedIds, messageId])).slice(-15)
            : pinnedIds.filter((id) => id !== messageId);
          await fsPatchDoc(
            `chatRooms/${roomId}/messages/${messageId}`,
            {
              isPinned: isPin,
              pinnedBy: isPin ? authUser.uid : '',
              pinnedByName: isPin ? String(actorDoc.displayName || '') : '',
              pinnedAt: isPin ? now : '',
            },
            token
          );
          await fsPatchDoc(`chatRooms/${roomId}`, { pinnedMessageIds: nextPinnedIds, updatedAt: now }, token);
        }
        logSummary = `${action}:${messageId}`;
      } else if (action === 'announcement_create' || action === 'announcement_update' || action === 'announcement_delete') {
        if (!hasRoomPerm('manageAnnouncements')) {
          res.status(403).json({ error: 'ليست لديك صلاحية نشر أو تعديل إعلانات الغرفة.' });
          return;
        }
        if (action === 'announcement_create') {
          const cleanTitle = String(title || '').trim().slice(0, 140);
          const cleanContent = String(content || '').trim().slice(0, 2000);
          if (!cleanTitle || !cleanContent) {
            res.status(400).json({ error: 'عنوان ومحتوى الإعلان مطلوبان.' });
            return;
          }
          const newAnnId = `rann_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
          await fsCreateDoc(
            `chatRooms/${roomId}/announcements`,
            newAnnId,
            {
              id: newAnnId,
              roomId,
              authorId: authUser.uid,
              authorName: String(actorDoc.displayName || 'مشرف'),
              title: cleanTitle,
              content: cleanContent,
              imageURL: imageURL || '',
              isPinned: true,
              createdAt: now,
              updatedAt: now,
            },
            token
          );
          logSummary = `announcement_create:${newAnnId}`;
        } else if (action === 'announcement_update' && announcementId) {
          await fsPatchDoc(
            `chatRooms/${roomId}/announcements/${announcementId}`,
            {
              ...(title !== undefined ? { title: String(title).trim().slice(0, 140) } : {}),
              ...(content !== undefined ? { content: String(content).trim().slice(0, 2000) } : {}),
              ...(imageURL !== undefined ? { imageURL: String(imageURL) } : {}),
              updatedAt: now,
            },
            token
          );
          logSummary = `announcement_update:${announcementId}`;
        } else if (action === 'announcement_delete' && announcementId) {
          await fsDeleteDoc(`chatRooms/${roomId}/announcements/${announcementId}`, token);
          logSummary = `announcement_delete:${announcementId}`;
        }
      } else if (action === 'update_appearance') {
        if (!hasRoomPerm('manageAppearance')) {
          res.status(403).json({ error: 'ليست لديك صلاحية تخصيص مظهر الغرفة.' });
          return;
        }
        const roomPatch: Record<string, unknown> = { updatedAt: now };
        if (appearance?.title && appearance.title.trim()) roomPatch.title = appearance.title.trim().slice(0, 100);
        if (appearance?.description !== undefined) roomPatch.description = String(appearance.description).trim().slice(0, 500);
        if (appearance?.imageURL !== undefined) roomPatch.imageURL = String(appearance.imageURL);
        if (appearance?.coverURL !== undefined) roomPatch.coverURL = String(appearance.coverURL);
        roomPatch.appearance = {
          bgColor: String(appearance?.bgColor ?? roomDoc.appearance?.bgColor ?? ''),
          bgPresetId: String(appearance?.bgPresetId ?? roomDoc.appearance?.bgPresetId ?? 'default'),
          bgImageURL: String(appearance?.bgImageURL ?? roomDoc.appearance?.bgImageURL ?? ''),
          bgScrimOpacity: Number.isFinite(Number(appearance?.bgScrimOpacity))
            ? Math.min(0.9, Math.max(0.1, Number(appearance?.bgScrimOpacity)))
            : Number(roomDoc.appearance?.bgScrimOpacity ?? 0.45),
          accentColor: String(appearance?.accentColor || roomDoc.appearance?.accentColor || '#3B6DFF'),
          bubbleTheme: String(appearance?.bubbleTheme || roomDoc.appearance?.bubbleTheme || 'classic'),
        };
        await fsPatchDoc(`chatRooms/${roomId}`, roomPatch, token);
        logSummary = 'update_appearance';
      } else {
        res.status(400).json({ error: 'إجراء غرفة غير معروف.' });
        return;
      }

      const mlogId = `rmlog_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      await fsCreateDoc(
        `chatRooms/${roomId}/moderationLogs`,
        mlogId,
        {
          id: mlogId,
          roomId,
          actorId: authUser.uid,
          actorName: String(actorDoc.displayName || 'Staff'),
          action: logSummary || action,
          targetId: targetUserId || messageId || announcementId || '',
          targetName: targetUserName || '',
          reason: reason || '',
          createdAt: now,
        },
        token
      ).catch(() => {});

      res.status(200).json({ ok: true, action: logSummary });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'فشل تنفيذ إجراء الغرفة.' });
    }
  });

  async function fsCountCollection(
    collectionId: string,
    bearerToken: string,
    filter?: { field: string; value: string }
  ): Promise<number> {
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId }],
    };
    if (filter) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: filter.field },
          op: 'EQUAL',
          value: { stringValue: filter.value },
        },
      };
    }
    const r = await fetch(`${FIRESTORE_REST_BASE}:runAggregationQuery`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery,
          aggregations: [{ alias: 'total', count: {} }],
        },
      }),
    });
    if (!r.ok) return 0;
    const rows = (await r.json()) as Array<{
      result?: { aggregateFields?: { total?: { integerValue?: string | number } } };
    }>;
    const rawVal = rows?.[0]?.result?.aggregateFields?.total?.integerValue;
    return Number.isFinite(Number(rawVal)) ? Number(rawVal) : 0;
  }

  app.get('/api/admin/metrics', async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    try {
      const actorDoc = await fsGetDoc(`users/${authUser.uid}`, token);
      if (!actorDoc) {
        res.status(404).json({ error: 'الحساب غير موجود.' });
        return;
      }
      const actorRole = String(actorDoc.role || 'user');
      const perms = actorDoc.globalPermissions && typeof actorDoc.globalPermissions === 'object' ? actorDoc.globalPermissions : {};
      const isStaffActor =
        ['owner', 'admin', 'assistant_admin', 'room_leader', 'moderator'].includes(actorRole) ||
        Object.values(perms).some(Boolean);
      if (!isStaffActor) {
        res.status(403).json({ error: 'صلاحية مرفوضة.' });
        return;
      }

      const [
        totalUsers,
        totalPosts,
        totalRooms,
        totalEvents,
        pendingReports,
        pendingVerifications,
        pendingAppeals,
        pendingStickers,
        activeLive,
      ] = await Promise.all([
        fsCountCollection('users', token),
        fsCountCollection('posts', token),
        fsCountCollection('chatRooms', token),
        fsCountCollection('events', token),
        fsCountCollection('reports', token, { field: 'status', value: 'pending' }),
        fsCountCollection('verification_requests', token, { field: 'status', value: 'pending' }),
        fsCountCollection('appeals', token, { field: 'status', value: 'pending' }),
        fsCountCollection('stickerPacks', token, { field: 'status', value: 'pending' }),
        fsCountCollection('liveBroadcasts', token, { field: 'status', value: 'live' }),
      ]);

      res.status(200).json({
        totalUsers,
        totalPosts,
        totalRooms,
        totalEvents,
        pendingReports,
        pendingVerifications,
        pendingAppeals,
        pendingStickers,
        activeLive,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر جلب إحصائيات المنصة.' });
    }
  });

  app.post('/api/stickers/packs', express.json({ limit: '64kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول لرفع حزمة ملصقات.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    const { title, description = '', coverURL, stickers } = (req.body || {}) as {
      title?: string;
      description?: string;
      coverURL?: string;
      stickers?: Array<{ id?: string; url?: string; label?: string; storagePath?: string; contentType?: string; sizeBytes?: number }>;
    };

    const cleanTitle = String(title || '').trim().slice(0, 60);
    if (cleanTitle.length < 2) {
      res.status(400).json({ error: 'يجب أن يكون اسم حزمة الملصقات مكوناً من حرفين على الأقل.' });
      return;
    }
    if (!Array.isArray(stickers) || stickers.length < 1 || stickers.length > 30) {
      res.status(400).json({ error: 'يجب أن تحتوي الحزمة على ملصق واحد إلى 30 ملصقاً.' });
      return;
    }

    const sanitizedStickers = stickers
      .map((s, idx) => ({
        id: String(s?.id || `stk_${Date.now()}_${idx}`).slice(0, 64),
        url: String(s?.url || '').trim(),
        label: String(s?.label || '').trim().slice(0, 40),
        storagePath: String(s?.storagePath || '').trim().slice(0, 300),
        contentType: String(s?.contentType || 'image/webp').slice(0, 50),
        sizeBytes: Number.isFinite(Number(s?.sizeBytes)) ? Number(s?.sizeBytes) : 0,
      }))
      .filter((s) => /^https?:\/\//i.test(s.url));

    if (sanitizedStickers.length === 0) {
      res.status(400).json({ error: 'روابط صور الملصقات غير صالحة.' });
      return;
    }

    try {
      const actorDoc = await fsGetDoc(`users/${authUser.uid}`, token);
      if (!actorDoc) {
        res.status(404).json({ error: 'لم يتم العثور على الحساب.' });
        return;
      }
      if (actorDoc.isBanned || actorDoc.isSuspended) {
        res.status(403).json({ error: 'حسابك مقيد ولا يمكنه رفع حزم ملصقات.' });
        return;
      }

      const actorRole = String(actorDoc.role || 'user');
      const autoApprove =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        actorRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, 'manageStickers');

      const now = new Date().toISOString();
      const packId = `spack_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const packDoc = {
        id: packId,
        title: cleanTitle,
        description: String(description || '').trim().slice(0, 240),
        coverURL: /^https?:\/\//i.test(String(coverURL || '')) ? String(coverURL).trim() : sanitizedStickers[0].url,
        authorId: authUser.uid,
        authorName: String(actorDoc.displayName || 'Q Member'),
        status: autoApprove ? 'approved' : 'pending',
        isEnabled: autoApprove,
        moderationNote: '',
        stickers: sanitizedStickers,
        installsCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await fsCreateDoc('stickerPacks', packId, packDoc, token);
      res.status(200).json({ ok: true, pack: packDoc });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر حفظ حزمة الملصقات.' });
    }
  });

  app.post('/api/admin/stickers', express.json({ limit: '32kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    const { packId, action, note = '' } = (req.body || {}) as {
      packId?: string;
      action?: 'approve' | 'reject' | 'disable' | 'enable' | 'delete';
      note?: string;
    };

    if (!packId || !action) {
      res.status(400).json({ error: 'بيانات الإجراء ناقصة.' });
      return;
    }

    try {
      const [actorDoc, packDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`stickerPacks/${packId}`, token),
      ]);
      if (!actorDoc || !packDoc) {
        res.status(404).json({ error: 'الحزمة أو الحساب غير موجود.' });
        return;
      }
      const actorRole = String(actorDoc.role || 'user');
      const allowed =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        actorRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, 'manageStickers');

      if (!allowed) {
        res.status(403).json({ error: 'ليست لديك صلاحية إدارة حزم الملصقات.' });
        return;
      }

      const now = new Date().toISOString();
      const cleanNote = String(note || '').trim().slice(0, 400);

      if (action === 'delete') {
        await fsDeleteDoc(`stickerPacks/${packId}`, token);
      } else {
        const nextStatus =
          action === 'approve' || action === 'enable'
            ? 'approved'
            : action === 'reject'
            ? 'rejected'
            : 'disabled';
        const nextEnabled = action === 'approve' || action === 'enable';
        await fsPatchDoc(
          `stickerPacks/${packId}`,
          {
            status: nextStatus,
            isEnabled: nextEnabled,
            moderationNote: cleanNote,
            reviewedBy: authUser.uid,
            reviewedByName: String(actorDoc.displayName || 'Admin'),
            reviewedAt: now,
            updatedAt: now,
          },
          token
        );
      }

      const auditId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const auditActionMap: Record<string, string> = {
        approve: 'sticker_approve',
        reject: 'sticker_reject',
        disable: 'sticker_disable',
        enable: 'sticker_enable',
        delete: 'sticker_delete',
      };
      await fsCreateDoc(
        'audit_logs',
        auditId,
        {
          id: auditId,
          actorId: authUser.uid,
          actorName: String(actorDoc.displayName || 'Admin'),
          actorRole,
          actionType: auditActionMap[action] || 'sticker_approve',
          targetType: 'sticker_pack',
          targetId: packId,
          targetDetails: `Sticker pack "${packDoc.title || packId}" -> ${action}`,
          reason: cleanNote,
          createdAt: now,
        },
        token
      ).catch(() => {});

      if (packDoc.authorId && packDoc.authorId !== authUser.uid && (action === 'approve' || action === 'reject' || action === 'disable')) {
        const nid = `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const msg =
          action === 'approve'
            ? `تمت الموافقة على حزمة الملصقات "${packDoc.title}" وأصبحت متاحة في الدردشات.`
            : action === 'reject'
            ? `تم رفض حزمة الملصقات "${packDoc.title}". ${cleanNote ? `السبب: ${cleanNote}` : ''}`
            : `تم تعطيل حزمة الملصقات "${packDoc.title}" إدارياً.`;
        await fsCreateDoc(
          'notifications',
          nid,
          {
            id: nid,
            recipientId: String(packDoc.authorId),
            senderId: authUser.uid,
            senderName: 'إدارة Q',
            senderPhotoURL: String(actorDoc.photoURL || ''),
            type: 'moderation',
            targetId: packId,
            message: msg.slice(0, 290),
            read: false,
            createdAt: now,
          },
          token
        ).catch(() => {});
      }

      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر تنفيذ إجراء الملصقات.' });
    }
  });

  app.post('/api/admin/rooms-action', express.json({ limit: '24kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    const { roomId, action, reason = '' } = (req.body || {}) as {
      roomId?: string;
      action?: 'toggle_readonly' | 'delete_room';
      reason?: string;
    };
    if (!roomId || !action) {
      res.status(400).json({ error: 'بيانات الغرفة ناقصة.' });
      return;
    }
    try {
      const [actorDoc, roomDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`chatRooms/${roomId}`, token),
      ]);
      if (!actorDoc || !roomDoc) {
        res.status(404).json({ error: 'الغرفة أو الحساب غير موجود.' });
        return;
      }
      const actorRole = String(actorDoc.role || 'user');
      const allowed =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        actorRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, 'manageRooms');
      if (!allowed) {
        res.status(403).json({ error: 'ليست لديك صلاحية الرقابة على غرف الدردشة.' });
        return;
      }

      const now = new Date().toISOString();
      if (action === 'toggle_readonly') {
        const nextRo = !Boolean(roomDoc.isReadOnly);
        await fsPatchDoc(`chatRooms/${roomId}`, { isReadOnly: nextRo, updatedAt: now }, token);
      } else if (action === 'delete_room') {
        await fsDeleteDoc(`chatRooms/${roomId}`, token);
      }

      const auditId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'audit_logs',
        auditId,
        {
          id: auditId,
          actorId: authUser.uid,
          actorName: String(actorDoc.displayName || 'Admin'),
          actorRole,
          actionType: action === 'delete_room' ? 'room_delete' : 'room_kick',
          targetType: 'room',
          targetId: roomId,
          targetDetails: `${action} on room "${roomDoc.title || roomId}"`,
          reason: String(reason || '').slice(0, 300),
          createdAt: now,
        },
        token
      ).catch(() => {});

      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر تنفيذ إجراء الغرفة.' });
    }
  });

  app.post('/api/live/moderate', express.json({ limit: '24kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'يجب تسجيل الدخول.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    const { broadcastId, action, targetUserId, reason = '' } = (req.body || {}) as {
      broadcastId?: string;
      action?: 'end_broadcast' | 'toggle_chat' | 'mute_viewer' | 'unmute_viewer' | 'ban_viewer';
      targetUserId?: string;
      reason?: string;
    };
    if (!broadcastId || !action) {
      res.status(400).json({ error: 'بيانات البث ناقصة.' });
      return;
    }
    try {
      const [actorDoc, liveDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`liveBroadcasts/${broadcastId}`, token),
      ]);
      if (!actorDoc || !liveDoc) {
        res.status(404).json({ error: 'البث أو الحساب غير موجود.' });
        return;
      }
      const actorRole = String(actorDoc.role || 'user');
      const isHost = liveDoc.hostId === authUser.uid;
      const isStaffAllowed =
        actorRole === 'owner' ||
        actorRole === 'admin' ||
        actorRole === 'assistant_admin' ||
        hasActorGlobalPerm(actorDoc, 'manageLive');

      if (!isHost && !isStaffAllowed) {
        res.status(403).json({ error: 'ليست لديك صلاحية إدارة هذا البث.' });
        return;
      }

      const now = new Date().toISOString();
      const mutedList: string[] = Array.isArray(liveDoc.mutedUserIds) ? liveDoc.mutedUserIds : [];
      const bannedList: string[] = Array.isArray(liveDoc.bannedUserIds) ? liveDoc.bannedUserIds : [];

      if (action === 'end_broadcast') {
        await fsPatchDoc(
          `liveBroadcasts/${broadcastId}`,
          {
            status: 'ended',
            playbackState: 'paused',
            endedAt: now,
            updatedAt: now,
          },
          token
        );
      } else if (action === 'toggle_chat') {
        await fsPatchDoc(
          `liveBroadcasts/${broadcastId}`,
          { isChatEnabled: !Boolean(liveDoc.isChatEnabled), updatedAt: now },
          token
        );
      } else if (targetUserId && targetUserId !== liveDoc.hostId) {
        if (action === 'mute_viewer') {
          await fsPatchDoc(
            `liveBroadcasts/${broadcastId}`,
            { mutedUserIds: Array.from(new Set([...mutedList, targetUserId])), updatedAt: now },
            token
          );
        } else if (action === 'unmute_viewer') {
          await fsPatchDoc(
            `liveBroadcasts/${broadcastId}`,
            { mutedUserIds: mutedList.filter((id) => id !== targetUserId), updatedAt: now },
            token
          );
        } else if (action === 'ban_viewer') {
          await fsPatchDoc(
            `liveBroadcasts/${broadcastId}`,
            { bannedUserIds: Array.from(new Set([...bannedList, targetUserId])), updatedAt: now },
            token
          );
          await fsDeleteDoc(`liveBroadcasts/${broadcastId}/viewers/${targetUserId}`, token).catch(() => {});
        }
      }

      if (isStaffAllowed && action === 'end_broadcast') {
        const auditId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await fsCreateDoc(
          'audit_logs',
          auditId,
          {
            id: auditId,
            actorId: authUser.uid,
            actorName: String(actorDoc.displayName || 'Admin'),
            actorRole,
            actionType: 'live_end',
            targetType: 'live_broadcast',
            targetId: broadcastId,
            targetDetails: `Ended live broadcast "${liveDoc.title || broadcastId}"`,
            reason: String(reason || '').slice(0, 300),
            createdAt: now,
          },
          token
        ).catch(() => {});
      }

      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر تنفيذ إجراء البث.' });
    }
  });

  app.post('/api/live/xp', express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
    let authUser: { uid: string; email?: string };
    try {
      authUser = await verifyFirebaseAuthHeader(req.headers.authorization);
    } catch {
      res.status(401).json({ error: 'جلسة غير مصرح بها.' });
      return;
    }
    const token = String(req.headers.authorization || '').slice(7).trim();
    const { broadcastId, role } = (req.body || {}) as { broadcastId?: string; role?: 'watch' | 'host' };
    if (!broadcastId || (role !== 'watch' && role !== 'host')) {
      res.status(400).json({ error: 'بيانات البث غير صالحة.' });
      return;
    }

    const action = role === 'host' ? 'live_host' : 'live_watch';
    const cfg = XP_ACTION_CONFIG[action];
    const now = new Date();
    const nowMs = now.getTime();
    const utc = getUtcDateInfo(now);

    try {
      const [userDoc, liveDoc] = await Promise.all([
        fsGetDoc(`users/${authUser.uid}`, token),
        fsGetDoc(`liveBroadcasts/${broadcastId}`, token),
      ]);
      if (!userDoc || !liveDoc) {
        res.status(404).json({ error: 'البث أو الحساب غير موجود.' });
        return;
      }
      if (liveDoc.status !== 'live') {
        res.status(200).json({ awarded: false, reason: 'broadcast_ended' });
        return;
      }
      if (role === 'host' && liveDoc.hostId !== authUser.uid) {
        res.status(403).json({ error: 'أنت لست مقدم هذا البث.' });
        return;
      }
      if (role === 'watch' && liveDoc.hostId === authUser.uid) {
        res.status(200).json({ awarded: false, reason: 'self_watch_blocked' });
        return;
      }
      if (Array.isArray(liveDoc.bannedUserIds) && liveDoc.bannedUserIds.includes(authUser.uid)) {
        res.status(403).json({ error: 'تم استبعادك من هذا البث.' });
        return;
      }

      const currentDayTotal =
        userDoc.dailyXpDate === utc.dateKey ? Math.max(0, Math.floor(Number(userDoc.dailyXpEarned || 0))) : 0;
      const lastActionMap =
        userDoc.xpActionLastAt && typeof userDoc.xpActionLastAt === 'object'
          ? (userDoc.xpActionLastAt as Record<string, unknown>)
          : {};
      const lastIso = typeof lastActionMap[action] === 'string' ? (lastActionMap[action] as string) : '';
      const lastMs = lastIso ? new Date(lastIso).getTime() : 0;

      if (lastMs && nowMs - lastMs < cfg.cooldownSec * 1000) {
        res.status(200).json({ awarded: false, reason: 'cooldown', dailyXpEarned: currentDayTotal, dailyXpCap: DAILY_XP_CAP });
        return;
      }
      if (currentDayTotal + cfg.amount > DAILY_XP_CAP) {
        res.status(200).json({ awarded: false, reason: 'daily_cap', dailyXpEarned: currentDayTotal, dailyXpCap: DAILY_XP_CAP });
        return;
      }

      const prevXp = Math.max(0, Math.floor(Number(userDoc.xp || 0)));
      const nextXp = prevXp + cfg.amount;
      const prevLevel = Math.max(1, Math.floor(Number(userDoc.level || 1)));
      const boundedLevel = Math.min(Math.max(prevLevel, computeServerLevelFromXp(nextXp)), prevLevel + 1);
      const nextDailyTotal = currentDayTotal + cfg.amount;

      const nextActionMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(lastActionMap)) {
        if (typeof v === 'string') nextActionMap[k] = v;
      }
      nextActionMap[action] = utc.nowIso;

      await fsPatchDoc(
        `users/${authUser.uid}`,
        {
          xp: nextXp,
          level: boundedLevel,
          dailyXpDate: utc.dateKey,
          dailyXpEarned: nextDailyTotal,
          xpActionLastAt: nextActionMap,
          lastActiveAt: utc.nowIso,
        },
        token
      );

      const logId = `xp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await fsCreateDoc(
        'xpLogs',
        logId,
        {
          id: logId,
          userId: authUser.uid,
          action,
          amount: cfg.amount,
          label: `${cfg.label}: ${String(liveDoc.title || '').slice(0, 40)}`,
          createdAt: utc.nowIso,
        },
        token
      ).catch(() => {});

      res.status(200).json({
        awarded: true,
        xpDelta: cfg.amount,
        xp: nextXp,
        level: boundedLevel,
        dailyXpEarned: nextDailyTotal,
        dailyXpCap: DAILY_XP_CAP,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'تعذر احتساب نقاط البث.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    const cfg = getSupabaseConfig();
    console.log(
      `[Q Server] Listening on http://0.0.0.0:${port} (Supabase Storage configured: ${cfg.configured}, bucket: ${cfg.bucket})`
    );
    if (cfg.configured) {
      try {
        const { client, bucket } = getSupabaseAdminClient();
        void ensureSupabaseBucket(client, bucket).catch((err) => {
          console.warn('[Storage] Startup bucket visibility check failed:', err?.message || err);
        });
      } catch {
        // Handled cleanly on health/upload routes
      }
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
