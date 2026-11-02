import sharp from "sharp";

/** Miniatura só em memória. Não grava arquivo no volume. */
export async function patientPhotoThumb(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(96, 96, { fit: "cover" })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    return null;
  }
}
