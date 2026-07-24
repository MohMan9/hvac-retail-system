"use client";

import { createClient } from "@/lib/supabase/client";
import {
  cleanProductImageFilename,
  PRODUCT_IMAGE_BUCKETS,
} from "@/lib/product-images";
import {
  getProductImageUploadContext,
  registerProductImageUploads,
} from "@/app/dashboard/products/image-actions";

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000];

type UploadedImage = {
  bucket: string;
  objectPath: string;
};

export type ProductImageUploadProgress = {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  bytesUploaded: number;
  bytesTotal: number;
};

export type ProductImageUploadResult =
  | { success: true; uploadedCount: number; failures: string[] }
  | { success: false; error: string };

function encodeTusMetadata(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function storageTusEndpoint() {
  const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const projectRef = projectUrl.hostname.endsWith(".supabase.co")
    ? projectUrl.hostname.split(".")[0]
    : null;
  const origin = projectRef
    ? `${projectUrl.protocol}//${projectRef}.storage.supabase.co`
    : projectUrl.origin;
  return `${origin}/storage/v1/upload/resumable`;
}

async function responseError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function wait(delayMs: number) {
  if (delayMs === 0) return;
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

async function createTusUpload(
  file: File,
  bucket: string,
  objectPath: string,
  accessToken: string
) {
  const endpoint = storageTusEndpoint();
  const metadata = [
    `bucketName ${encodeTusMetadata(bucket)}`,
    `objectName ${encodeTusMetadata(objectPath)}`,
    `contentType ${encodeTusMetadata(file.type || "application/octet-stream")}`,
    `cacheControl ${encodeTusMetadata("3600")}`,
  ].join(",");
  let lastError = "Could not start resumable upload.";

  for (const delayMs of RETRY_DELAYS_MS) {
    await wait(delayMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(file.size),
          "Upload-Metadata": metadata,
          "x-upsert": "false",
        },
      });

      if (response.ok) {
        const location = response.headers.get("Location");
        if (!location) throw new Error("Storage did not return a resumable upload URL.");
        return new URL(location, endpoint).toString();
      }

      lastError = await responseError(response);
      if (!shouldRetry(response.status)) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

async function readTusOffset(uploadUrl: string, accessToken: string) {
  const response = await fetch(uploadUrl, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Tus-Resumable": "1.0.0",
    },
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  const offset = Number(response.headers.get("Upload-Offset"));
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error("Storage returned an invalid resumable upload offset.");
  }
  return offset;
}

async function uploadLargeFile(
  file: File,
  bucket: string,
  objectPath: string,
  accessToken: string,
  onProgress: (bytesUploaded: number) => void
) {
  const uploadUrl = await createTusUpload(file, bucket, objectPath, accessToken);
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + TUS_CHUNK_BYTES, file.size));
    let uploaded = false;
    let lastError = "Resumable upload failed.";

    for (const delayMs of RETRY_DELAYS_MS) {
      await wait(delayMs);
      try {
        const response = await fetch(uploadUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
          },
          body: chunk,
        });

        if (response.ok) {
          const nextOffset = Number(response.headers.get("Upload-Offset"));
          offset = Number.isFinite(nextOffset) ? nextOffset : offset + chunk.size;
          onProgress(offset);
          uploaded = true;
          break;
        }

        lastError = await responseError(response);
        if (!shouldRetry(response.status) && response.status !== 409) break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // A response can be lost after Storage accepted a chunk. Recover the
      // authoritative offset before retrying so bytes are never duplicated.
      try {
        const remoteOffset = await readTusOffset(uploadUrl, accessToken);
        if (remoteOffset > offset) {
          offset = remoteOffset;
          onProgress(offset);
          uploaded = true;
          break;
        }
      } catch {
        // Keep the original upload error; the next retry may still recover.
      }
    }

    if (!uploaded) throw new Error(lastError);
  }
}

async function removeUploadedObjects(uploads: UploadedImage[]) {
  const supabase = createClient();
  for (const { bucket, objectPath } of uploads) {
    await supabase.storage.from(bucket).remove([objectPath]);
  }
}

export async function uploadProductImagesDirect(
  productId: string,
  files: File[],
  onProgress?: (progress: ProductImageUploadProgress) => void
): Promise<ProductImageUploadResult> {
  if (files.length === 0) {
    return { success: false, error: "Choose at least one image to upload." };
  }

  if (files.length > 20) {
    return { success: false, error: "Upload at most 20 images at a time." };
  }

  const context = await getProductImageUploadContext(productId);
  if (!context.success) return context;

  const supabase = createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return { success: false, error: sessionError?.message ?? "Not authenticated" };
  }

  const uploads: UploadedImage[] = [];
  const failures: string[] = [];

  for (const [index, file] of files.entries()) {
    const uniqueName = `${crypto.randomUUID()}-${cleanProductImageFilename(file.name)}`;
    const objectPath = `${context.organizationId}/${productId}/${uniqueName}`;
    const bucketErrors: string[] = [];
    let uploaded: UploadedImage | null = null;

    onProgress?.({
      fileIndex: index + 1,
      fileCount: files.length,
      fileName: file.name,
      bytesUploaded: 0,
      bytesTotal: file.size,
    });

    for (const bucket of PRODUCT_IMAGE_BUCKETS) {
      try {
        if (file.size > TUS_CHUNK_BYTES) {
          await uploadLargeFile(
            file,
            bucket,
            objectPath,
            session.access_token,
            (bytesUploaded) =>
              onProgress?.({
                fileIndex: index + 1,
                fileCount: files.length,
                fileName: file.name,
                bytesUploaded,
                bytesTotal: file.size,
              })
          );
        } else {
          const { error } = await supabase.storage.from(bucket).upload(objectPath, file, {
            contentType: file.type || undefined,
            cacheControl: "3600",
            upsert: false,
          });
          if (error) throw error;
          onProgress?.({
            fileIndex: index + 1,
            fileCount: files.length,
            fileName: file.name,
            bytesUploaded: file.size,
            bytesTotal: file.size,
          });
        }

        uploaded = { bucket, objectPath };
        break;
      } catch (error) {
        bucketErrors.push(
          `${bucket}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (uploaded) {
      uploads.push(uploaded);
    } else {
      failures.push(`${file.name}: ${bucketErrors.join("; ")}`);
    }
  }

  if (uploads.length === 0) {
    return { success: false, error: `Upload failed: ${failures.join("; ")}` };
  }

  const registered = await registerProductImageUploads(productId, uploads);
  if (!registered.success) {
    await removeUploadedObjects(uploads);
    return registered;
  }

  return { success: true, uploadedCount: registered.uploadedCount, failures };
}

