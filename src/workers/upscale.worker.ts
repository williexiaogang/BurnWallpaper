import * as ort from "onnxruntime-web";
import wasmMjs from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import wasmBinary from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

ort.env.wasm.wasmPaths = { mjs: wasmMjs, wasm: wasmBinary };
ort.env.wasm.numThreads = 1;

interface Request { image: Blob; model: ArrayBuffer; targetWidth: number; targetHeight: number }
self.onmessage = async (event: MessageEvent<Request>) => {
  let bitmap: ImageBitmap | undefined;
  let session: ort.InferenceSession | undefined;
  try {
    const { image, model, targetWidth, targetHeight } = event.data;
    bitmap = await createImageBitmap(image);
    const scale = Math.min(4, Math.max(targetWidth / bitmap.width, targetHeight / bitmap.height));
    if (scale <= 1) { self.postMessage({ type: "done", blob: null }); return; }
    const width = Math.ceil(bitmap.width * scale), height = Math.ceil(bitmap.height * scale);
    if (width * height > 33_554_432) throw new Error("目标图像过大，无法安全放大");
    const result = new OffscreenCanvas(width, height);
    const output = result.getContext("2d");
    if (!output) throw new Error("无法创建输出画布");
    output.imageSmoothingEnabled = true;
    output.imageSmoothingQuality = "high";
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    const tileSize = 128, pad = 16;
    const total = Math.ceil(bitmap.width / tileSize) * Math.ceil(bitmap.height / tileSize);
    let completed = 0;
    for (let y = 0; y < bitmap.height; y += tileSize) for (let x = 0; x < bitmap.width; x += tileSize) {
      const x0 = Math.max(0, x - pad), y0 = Math.max(0, y - pad);
      const x1 = Math.min(bitmap.width, x + tileSize + pad), y1 = Math.min(bitmap.height, y + tileSize + pad);
      const w = x1 - x0, h = y1 - y0;
      const source = new OffscreenCanvas(w, h), context = source.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法读取图片");
      context.drawImage(bitmap, x0, y0, w, h, 0, 0, w, h);
      const rgba = context.getImageData(0, 0, w, h).data;
      const pixels = w * h, data = new Float32Array(pixels * 3);
      for (let i = 0; i < pixels; i++) for (let c = 0; c < 3; c++) data[c * pixels + i] = rgba[i * 4 + c] / 255;
      const inference = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, h, w]) });
      const tensor = inference[session.outputNames[0]];
      if (tensor.dims[2] !== h * 4 || tensor.dims[3] !== w * 4) throw new Error("放大模型输出尺寸不正确");
      const values = tensor.data as Float32Array, outPixels = w * h * 16;
      const patch = new ImageData(w * 4, h * 4);
      for (let i = 0; i < outPixels; i++) { for (let c = 0; c < 3; c++) patch.data[i * 4 + c] = Math.round(Math.max(0, Math.min(1, values[c * outPixels + i])) * 255); patch.data[i * 4 + 3] = 255; }
      const tile = new OffscreenCanvas(w * 4, h * 4), tileContext = tile.getContext("2d");
      if (!tileContext) throw new Error("无法创建图像分块");
      tileContext.putImageData(patch, 0, 0);
      const cw = Math.min(tileSize, bitmap.width - x), ch = Math.min(tileSize, bitmap.height - y);
      const dx0 = Math.round(x * scale), dy0 = Math.round(y * scale);
      const dx1 = Math.round((x + cw) * scale), dy1 = Math.round((y + ch) * scale);
      output.drawImage(tile, (x - x0) * 4, (y - y0) * 4, cw * 4, ch * 4, dx0, dy0, dx1 - dx0, dy1 - dy0);
      self.postMessage({ type: "progress", percent: Math.round(++completed / total * 100) });
    }
    self.postMessage({ type: "done", blob: await result.convertToBlob({ type: "image/png" }) });
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  finally { bitmap?.close(); await session?.release(); }
};
