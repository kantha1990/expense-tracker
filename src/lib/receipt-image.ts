// A bounded, on-device retry image. The original photo remains available for review.
export async function prepareReceiptImage(
  file: File,
  enhance = true,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(3, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Image preparation unavailable");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (!enhance)
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Image preparation failed")),
          "image/png",
        ),
      );
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Uint32Array(256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(
        0.299 * pixels.data[i] +
          0.587 * pixels.data[i + 1] +
          0.114 * pixels.data[i + 2],
      );
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
      histogram[gray]++;
    }
    const count = canvas.width * canvas.height;
    let lower = 0,
      upper = 255,
      sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (sum >= count * 0.01) {
        lower = i;
        break;
      }
    }
    sum = 0;
    for (let i = 255; i >= 0; i--) {
      sum += histogram[i];
      if (sum >= count * 0.01) {
        upper = i;
        break;
      }
    }
    if (upper - lower >= 30) {
      for (let i = 0; i < pixels.data.length; i += 4) {
        const gray = Math.max(
          0,
          Math.min(
            255,
            Math.round(((pixels.data[i] - lower) * 255) / (upper - lower)),
          ),
        );
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Image preparation failed")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}
