import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { patientPhotoThumb } from "../lib/files/casa-thumb.ts";

test("a miniatura fica menor que o arquivo de origem e não depende de disco", async () => {
  const source = await sharp({
    create: { width: 1600, height: 2000, channels: 3, background: "#c884a5" },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  const thumb = await patientPhotoThumb(source);
  assert.ok(thumb);
  assert.ok(thumb.length < source.length);
  assert.equal(thumb[0], 0x52);
  assert.equal(thumb[1], 0x49);
});
