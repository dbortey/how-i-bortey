import { describe, it, expect } from "vitest";
import { encodeWebpUnderLimit, optimizeImage, MAX_MEDIA_BYTES } from "../src/media/optimize";

const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function riff(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  return String.fromCharCode(u[0], u[1], u[2], u[3]) + String.fromCharCode(u[8], u[9], u[10], u[11]);
}

describe("encodeWebpUnderLimit", () => {
  it("compresses a large noisy image to WebP at or under the cap", async () => {
    const width = 640;
    const height = 480;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 256);
      if (i % 4 === 3) data[i] = 255;
    }
    const result = await encodeWebpUnderLimit({ data, width, height });
    expect(riff(result.bytes)).toBe("RIFFWEBP");
    expect(result.bytes.byteLength).toBeLessThanOrEqual(MAX_MEDIA_BYTES);
  }, 30000);
});

describe("optimizeImage", () => {
  it("converts a JPEG to WebP under the cap", async () => {
    const result = await optimizeImage(b64ToArrayBuffer(JPEG_B64), "image/jpeg");
    expect(result).not.toBeNull();
    expect(result!.mime).toBe("image/webp");
    expect(riff(result!.bytes)).toBe("RIFFWEBP");
    expect(result!.bytes.byteLength).toBeLessThanOrEqual(MAX_MEDIA_BYTES);
  }, 30000);

  it("leaves non-JPEG types untouched", async () => {
    expect(await optimizeImage(new ArrayBuffer(8), "image/png")).toBeNull();
    expect(await optimizeImage(new ArrayBuffer(8), "application/pdf")).toBeNull();
  });
});
