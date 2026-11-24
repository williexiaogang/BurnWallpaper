import * as ort from "onnxruntime-web";
import wasmMjs from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import wasmBinary from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.wasmPaths = { mjs: wasmMjs, wasm: wasmBinary };
ort.env.wasm.numThreads = 1;
const SIZE = 512;

/** Build a binary, expanded mask in two passes, limiting work to the preview-sized image. */
function expandedMask(alpha: Uint8ClampedArray, radius: number): Float32Array {
  const width = SIZE, height = SIZE, horizontal = new Uint8Array(width * height), output = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++) {
      if (alpha[(y * width + xx) * 4 + 3] > 24) { horizontal[y * width + x] = 1; break; }
    }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++) {
      if (horizontal[yy * width + x]) { output[y * width + x] = 1; break; }
    }
  }
  return output;
}

interface Request { image: Blob; subject: Blob; model: ArrayBuffer }
self.onmessage = async (event: MessageEvent<Request>) => {
  let original: ImageBitmap | undefined, subject: ImageBitmap | undefined, session: ort.InferenceSession | undefined;
  try {
    original = await createImageBitmap(event.data.image);
    subject = await createImageBitmap(event.data.subject);
    if (original.width !== subject.width || original.height !== subject.height) throw new Error("抠像尺寸与原图不一致，请重新抠像");
    const factor = Math.min(SIZE / original.width, SIZE / original.height);
    const width = Math.max(1, Math.round(original.width * factor)), height = Math.max(1, Math.round(original.height * factor));
    const left = Math.floor((SIZE - width) / 2), top = Math.floor((SIZE - height) / 2);
    const imageCanvas = new OffscreenCanvas(SIZE, SIZE), imageContext = imageCanvas.getContext("2d", { willReadFrequently: true });
    const subjectCanvas = new OffscreenCanvas(SIZE, SIZE), subjectContext = subjectCanvas.getContext("2d", { willReadFrequently: true });
    if (!imageContext || !subjectContext) throw new Error("无法创建图片画布");
    imageContext.fillStyle = "#000";
    imageContext.fillRect(0, 0, SIZE, SIZE);
    imageContext.drawImage(original, left, top, width, height);
    subjectContext.drawImage(subject, left, top, width, height);
    const image = imageContext.getImageData(0, 0, SIZE, SIZE).data;
    const mask = expandedMask(subjectContext.getImageData(0, 0, SIZE, SIZE).data, 8);
    if (!mask.some((value) => value > 0)) throw new Error("没有检测到可补全的主体");
    const pixels = SIZE * SIZE, rgb = new Float32Array(pixels * 3);
    for (let i = 0; i < pixels; i++) for (let channel = 0; channel < 3; channel++) rgb[channel * pixels + i] = image[i * 4 + channel] / 255;
    self.postMessage({ type: "progress", stage: "inference" });
    session = await ort.InferenceSession.create(event.data.model, { executionProviders: ["wasm"] });
    const prediction = await session.run({ image: new ort.Tensor("float32", rgb, [1, 3, SIZE, SIZE]), mask: new ort.Tensor("float32", mask, [1, 1, SIZE, SIZE]) });
    const tensor = prediction.output;
    if (!tensor || tensor.dims.length !== 4 || tensor.dims[1] !== 3 || tensor.dims[2] !== SIZE || tensor.dims[3] !== SIZE) throw new Error("背景补全模型输出尺寸不正确");
    const result = tensor.data as Float32Array, patch = new ImageData(SIZE, SIZE), maskImage = new ImageData(SIZE, SIZE);
    for (let i = 0; i < pixels; i++) {
      for (let channel = 0; channel < 3; channel++) patch.data[i * 4 + channel] = Math.round(Math.max(0, Math.min(255, result[channel * pixels + i])));
      patch.data[i * 4 + 3] = 255;
      maskImage.data[i * 4] = maskImage.data[i * 4 + 1] = maskImage.data[i * 4 + 2] = 255;
      maskImage.data[i * 4 + 3] = mask[i] * 255;
    }
    const patchCanvas = new OffscreenCanvas(SIZE, SIZE), patchContext = patchCanvas.getContext("2d");
    const maskCanvas = new OffscreenCanvas(SIZE, SIZE), maskContext = maskCanvas.getContext("2d");
    if (!patchContext || !maskContext) throw new Error("无法创建补全画布");
    patchContext.putImageData(patch, 0, 0);
    maskContext.putImageData(maskImage, 0, 0);
    patchContext.globalCompositeOperation = "destination-in";
    patchContext.filter = "blur(2px)";
    patchContext.drawImage(maskCanvas, 0, 0);
    const previewScale = Math.min(1, 1536 / Math.max(original.width, original.height));
    const outWidth = Math.max(1, Math.round(original.width * previewScale)), outHeight = Math.max(1, Math.round(original.height * previewScale));
    const output = new OffscreenCanvas(outWidth, outHeight), outputContext = output.getContext("2d");
    if (!outputContext) throw new Error("无法创建预览画布");
    outputContext.drawImage(original, 0, 0, outWidth, outHeight);
    outputContext.drawImage(patchCanvas, left, top, width, height, 0, 0, outWidth, outHeight);
    const blob = await output.convertToBlob({ type: "image/png" });
    self.postMessage({ type: "done", blob });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  finally { original?.close(); subject?.close(); await session?.release(); }
};
