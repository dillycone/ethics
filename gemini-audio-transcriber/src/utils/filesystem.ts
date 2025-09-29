import * as fs from "fs";
import { FileSystem } from "../types.js";

const fsp = fs.promises;

export class NodeFileSystem implements FileSystem {
  async readFile(path: string): Promise<Buffer> {
    return fsp.readFile(path);
  }

  async writeFile(path: string, content: Buffer | string): Promise<void> {
    await fsp.writeFile(path, content);
  }

  createWriteStream(path: string): NodeJS.WritableStream {
    return fs.createWriteStream(path);
  }

  async stat(path: string): Promise<{ isFile: () => boolean; size: number }> {
    const stats = await fsp.stat(path);
    return {
      isFile: () => stats.isFile(),
      size: stats.size,
    };
  }

  async readdir(
    path: string
  ): Promise<Array<{ name: string; isFile: () => boolean }>> {
    const entries = await fsp.readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isFile: () => entry.isFile(),
    }));
  }

  async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
    await fsp.mkdir(path, options);
  }
}