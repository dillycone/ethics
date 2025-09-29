import * as fs from "fs";
import * as path from "path";
import { PutObjectCommand, S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import { S3UploadConfig } from "../types.js";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};

function resolveContentType(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension];
}

function sanitizePrefix(prefix: string | undefined): string | undefined {
  if (!prefix) {
    return undefined;
  }

  const trimmed = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export class S3Uploader {
  private readonly client: S3Client;
  private readonly resolvedPrefix?: string;

  constructor(private readonly config: S3UploadConfig) {
    const clientConfig: S3ClientConfig = { region: config.region };
    if (config.profile) {
      clientConfig.credentials = fromIni({ profile: config.profile });
    }

    this.client = new S3Client(clientConfig);
    this.resolvedPrefix = sanitizePrefix(config.prefix);
  }

  private buildKey(filePath: string): string {
    const baseName = path.basename(filePath);
    if (!this.resolvedPrefix) {
      return baseName;
    }
    return `${this.resolvedPrefix}/${baseName}`;
  }

  async uploadFile(localPath: string): Promise<string> {
    const key = this.buildKey(localPath);
    const bodyStream = fs.createReadStream(localPath);

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: bodyStream,
      ContentType: resolveContentType(localPath),
      ACL: this.config.acl,
    });

    await this.client.send(command);
    return `s3://${this.config.bucket}/${key}`;
  }
}
