/**
 * 縮略圖 worker：4K 原圖的解碼 + 縮放 + webp 編碼全部在此線程完成，主線程只收結果。
 * 列表頁（Shelf/收藏/輪換）直接引用 4K 原圖時，每張解碼後 ~37MB 紋理、十幾張就是數百 MB。
 */

interface ThumbRequest {
  reqId: number;
  imageUrl: string;
  width: number;
}

interface ThumbResponse {
  reqId: number;
  blob: Blob | null;
}

const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<ThumbRequest>) => void) => void;
  postMessage: (message: ThumbResponse) => void;
};

let queue: Promise<void> = Promise.resolve();

ctx.addEventListener("message", (event) => {
  const { reqId, imageUrl, width } = event.data ?? {};
  if (!reqId || !imageUrl || !width) return;
  queue = queue.then(async () => {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      // createImageBitmap 的解碼與縮放在瀏覽器內部線程完成，resizeWidth 直接輸出小圖
      const bitmap = await createImageBitmap(blob, { resizeWidth: width, resizeQuality: "medium" });
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas context unavailable");
        context.drawImage(bitmap, 0, 0);
        try {
          ctx.postMessage({ reqId, blob: await canvas.convertToBlob({ type: "image/webp", quality: 0.82 }) });
        } catch {
          ctx.postMessage({ reqId, blob: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 }) });
        }
      } finally {
        bitmap.close();
      }
    } catch (error) {
      console.warn("[thumb] 生成缩略图失败", imageUrl, error);
      ctx.postMessage({ reqId, blob: null });
    }
  });
});
