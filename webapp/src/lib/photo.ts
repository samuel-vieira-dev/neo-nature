"use client";

/** Downscales an image file to ≤800px JPEG and uploads it. Returns the photo id. */
export async function uploadPhoto(file: File, kind: "first_dose" | "progress" | "ticket"): Promise<number> {
  const dataUrl = await downscale(file, 800, 0.82);
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg";

  const res = await fetch("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, mime, dataBase64: base64 }),
  });
  if (!res.ok) throw new Error("upload_failed");
  return (await res.json()).id as number;
}

function downscale(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}
