export const PRODUCT_IMAGE_BUCKETS = ["product-images", "product_images"] as const;
export const DEFAULT_PRODUCT_IMAGE_BUCKET = PRODUCT_IMAGE_BUCKETS[0];

export function cleanProductImageFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "image";
}

export function buildProductImageStoragePath(bucket: string, objectPath: string) {
  return `${bucket}/${objectPath}`;
}

export function parseProductImageStoragePath(storagePath: string) {
  for (const bucket of PRODUCT_IMAGE_BUCKETS) {
    const prefix = `${bucket}/`;

    if (storagePath.startsWith(prefix)) {
      return {
        bucket,
        objectPath: storagePath.slice(prefix.length),
      };
    }
  }

  return {
    bucket: DEFAULT_PRODUCT_IMAGE_BUCKET,
    objectPath: storagePath,
  };
}
