import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

let model: nsfwjs.NSFWJS | null = null;
let loading: Promise<nsfwjs.NSFWJS> | null = null;

export interface NsfwResult {
  isNsfw: boolean;
  confidence: number;
  label: string;
}

const UNSAFE_LABELS = new Set([
  "Porn",
  "Hentai",
  "Sexy",
]);

const NSFW_THRESHOLD = 0.70;

// Prevent extremely large images from consuming excessive memory.
const MAX_IMAGE_PIXELS = 12_000_000;

// ============================================================
// MODEL LOADER
// ============================================================

async function loadModel(): Promise<nsfwjs.NSFWJS> {
  if (model) {
    return model;
  }

  if (loading) {
    return loading;
  }

  loading = (async () => {
    await tf.ready();

    console.log("🧠 Loading Dark Vortex NSFW model...");

    const loadedModel = await nsfwjs.load();

    model = loadedModel;

    console.log("🧠 Dark Vortex NSFW protection ready.");

    return loadedModel;
  })();

  try {
    return await loading;
  } catch (error) {
    model = null;

    console.error(
      "❌ Dark Vortex NSFW model failed to load:",
      error
    );

    throw error;
  } finally {
    loading = null;
  }
}

// ============================================================
// IMAGE FORMAT DETECTION
// ============================================================

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

// ============================================================
// IMAGE VALIDATION
// ============================================================

function validateDimensions(
  width: number,
  height: number
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Invalid image dimensions.");
  }

  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions.");
  }

  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `Image is too large. Maximum supported size is ${MAX_IMAGE_PIXELS} pixels.`
    );
  }
}

// ============================================================
// IMAGE DECODER
// ============================================================

function decodeImage(buffer: Buffer): tf.Tensor3D {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty image buffer.");
  }

  // ----------------------------------------------------------
  // PNG
  // ----------------------------------------------------------

  if (isPng(buffer)) {
    const decoded = PNG.sync.read(buffer);

    validateDimensions(
      decoded.width,
      decoded.height
    );

    const values = new Int32Array(
      decoded.width *
        decoded.height *
        3
    );

    let offset = 0;

    // pngjs normally returns RGBA data.
    for (
      let i = 0;
      i < decoded.data.length;
      i += 4
    ) {
      values[offset++] =
        decoded.data[i];

      values[offset++] =
        decoded.data[i + 1];

      values[offset++] =
        decoded.data[i + 2];
    }

    return tf.tensor3d(
      values,
      [
        decoded.height,
        decoded.width,
        3,
      ],
      "int32"
    );
  }

  // ----------------------------------------------------------
  // JPEG
  // ----------------------------------------------------------

  if (isJpeg(buffer)) {
    const decoded = jpeg.decode(
      buffer,
      {
        useTArray: true,
        formatAsRGBA: true,
      }
    );

    validateDimensions(
      decoded.width,
      decoded.height
    );

    const values = new Int32Array(
      decoded.width *
        decoded.height *
        3
    );

    let offset = 0;

    for (
      let i = 0;
      i < decoded.data.length;
      i += 4
    ) {
      values[offset++] =
        decoded.data[i];

      values[offset++] =
        decoded.data[i + 1];

      values[offset++] =
        decoded.data[i + 2];
    }

    return tf.tensor3d(
      values,
      [
        decoded.height,
        decoded.width,
        3,
      ],
      "int32"
    );
  }

  throw new Error(
    "Unsupported image format. Only JPEG and PNG are supported."
  );
}

// ============================================================
// NSFW DETECTION
// ============================================================

export async function detectNsfw(
  buffer: Buffer
): Promise<NsfwResult> {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      "NSFW detector expected a Buffer."
    );
  }

  if (buffer.length === 0) {
    throw new Error(
      "Cannot analyze an empty image."
    );
  }

  const detector =
    await loadModel();

  let imageTensor:
    | tf.Tensor3D
    | null = null;

  try {
    imageTensor =
      decodeImage(buffer);

    const predictions =
      await detector.classify(
        imageTensor
      );

    let highestUnsafeConfidence = 0;
    let highestUnsafeLabel = "Safe";

    for (
      const prediction of predictions
    ) {
      if (
        UNSAFE_LABELS.has(
          prediction.className
        ) &&
        prediction.probability >
          highestUnsafeConfidence
      ) {
        highestUnsafeConfidence =
          prediction.probability;

        highestUnsafeLabel =
          prediction.className;
      }
    }

    return {
      isNsfw:
        highestUnsafeConfidence >=
        NSFW_THRESHOLD,

      confidence:
        highestUnsafeConfidence,

      label:
        highestUnsafeLabel,
    };
  } finally {
    if (imageTensor) {
      imageTensor.dispose();
    }
  }
}

// ============================================================
// MODEL STATUS
// ============================================================

export function isNsfwModelReady(): boolean {
  return model !== null;
}

// ============================================================
// OPTIONAL MODEL PRELOAD
// ============================================================

export async function preloadNsfwModel(): Promise<void> {
  await loadModel();
}