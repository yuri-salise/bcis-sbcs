import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface StoredFileInfo {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  absolutePath: string;
}

export class StorageService {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || process.env.STORAGE_DIR || path.resolve(process.cwd(), "uploads", "proofs");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Validates file size and MIME type.
   */
  public validateFile(mimeType: string, sizeBytes: number): void {
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds the maximum allowed limit of 5 MB.`);
    }

    const normalizedMime = mimeType.toLowerCase();
    const isAllowed = (ALLOWED_MIME_TYPES as readonly string[]).includes(normalizedMime);
    if (!isAllowed) {
      throw new Error(`Invalid file type '${mimeType}'. Allowed types: JPEG, PNG, WebP, PDF.`);
    }
  }

  /**
   * Computes SHA-256 hash from buffer.
   */
  public computeSha256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Securely saves an attachment buffer to disk.
   */
  public async saveProofFile(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string
  ): Promise<StoredFileInfo> {
    const size = fileBuffer.length;
    this.validateFile(mimeType, size);

    const sha256 = this.computeSha256(fileBuffer);
    const sanitizedExt = path.extname(originalFilename).toLowerCase() || (mimeType === "application/pdf" ? ".pdf" : ".jpg");
    const uniqueFileName = `proof-${crypto.randomUUID()}-${Date.now()}${sanitizedExt}`;
    const destinationPath = path.join(this.baseDir, uniqueFileName);

    await fs.promises.writeFile(destinationPath, fileBuffer);

    return {
      storageKey: uniqueFileName,
      originalFilename: path.basename(originalFilename),
      mimeType,
      fileSize: size,
      sha256,
      absolutePath: destinationPath,
    };
  }

  /**
   * Resolves a storageKey safely preventing path traversal attacks.
   */
  public getAbsolutePath(storageKey: string): string {
    const safeKey = path.basename(storageKey);
    const resolvedPath = path.resolve(this.baseDir, safeKey);

    // Guard against directory traversal
    if (!resolvedPath.startsWith(path.resolve(this.baseDir))) {
      throw new Error("Invalid storage key: directory traversal detected");
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found for storage key '${safeKey}'`);
    }

    return resolvedPath;
  }

  /**
   * Reads file content into a buffer.
   */
  public async readFile(storageKey: string): Promise<Buffer> {
    const filePath = this.getAbsolutePath(storageKey);
    return await fs.promises.readFile(filePath);
  }
}

export const storageService = new StorageService();
