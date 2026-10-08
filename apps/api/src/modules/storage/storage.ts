// Phase 1 contract only. No adapter, bucket provisioning, or upload routes yet.
// File allowlists, quotas, scanning, and download policy belong to Phase 3.
export interface ObjectMetadata {
  sizeBytes: number;
  contentType: string;
  checksum: string | null;
}
export interface PrivateObjectStorage {
  createUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
  createDownloadUrl(input: {
    objectKey: string;
    filename: string;
    expiresInSeconds: number;
  }): Promise<string>;
  getMetadata(objectKey: string): Promise<ObjectMetadata | null>;
  deleteObject(objectKey: string): Promise<void>;
}
export interface StorageConfiguration {
  bucket: string;
  region: string;
  endpoint?: string;
}
