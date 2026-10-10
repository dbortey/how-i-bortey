import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode.js";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode.js";
import JPEG_DEC_WASM from "./wasm/mozjpeg_dec.wasm";
import WEBP_ENC_WASM from "./wasm/webp_enc.wasm";

export const MAX_MEDIA_BYTES = 150 * 1024;

interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await initJpegDecode(JPEG_DEC_WASM);
      await initWebpEncode(WEBP_ENC_WASM);
    })();
  }
  return initPromise;
}

function downscale(img: RawImage, newW: number, newH: number): RawImage {
  const out = new Uint8ClampedArray(newW * newH * 4);
  const xRatio = img.width / newW;
  const yRatio = img.height / newH;
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * xRatio));
      const si = (sy * img.width + sx) * 4;
      const di = (y * newW + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  return { data: out, width: newW, height: newH };
}

const QUALITIES = [80, 65, 50, 38];
const DIMENSION_STEPS = [1280, 1024, 800, 640, 512];

export async function encodeWebpUnderLimit(
  image: RawImage,
  maxBytes = MAX_MEDIA_BYTES,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  await ensureInit();
  let current = image;
  let smallest: ArrayBuffer | null = null;

  for (const dim of DIMENSION_STEPS) {
    const longest = Math.max(current.width, current.height);
    if (longest > dim) {
      const scale = dim / longest;
      current = downscale(
        current,
        Math.max(1, Math.round(current.width * scale)),
        Math.max(1, Math.round(current.height * scale)),
      );
    }
    for (const q of QUALITIES) {
      const bytes = await encodeWebp(current as unknown as Parameters<typeof encodeWebp>[0], { quality: q });
      if (!smallest || bytes.byteLength < smallest.byteLength) smallest = bytes;
      if (bytes.byteLength <= maxBytes) {
        return { bytes, width: current.width, height: current.height };
      }
    }
  }
  return { bytes: smallest!, width: current.width, height: current.height };
}

export interface OptimizedImage {
  bytes: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
}

export async function optimizeImage(
  bytes: ArrayBuffer,
  mime: string,
): Promise<OptimizedImage | null> {
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg" && type !== "image/jpg") return null;
  await ensureInit();
  const decoded = (await decodeJpeg(bytes)) as unknown as RawImage;
  const result = await encodeWebpUnderLimit(decoded);
  return { bytes: result.bytes, mime: "image/webp", width: result.width, height: result.height };
}
