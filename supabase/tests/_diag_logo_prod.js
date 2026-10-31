const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const { execSync } = require("child_process");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "cache-control": "no-cache" } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      })
      .on("error", reject);
  });
}

(async () => {
  const html = await get("https://casa-florescer-sistema-completo.vercel.app/login");
  const h = html.body.toString("utf8");
  const src = (h.match(/src="([^"]*logo[^"]*)"/) || [])[1] || null;
  console.log("LOGIN_STATUS", html.status);
  console.log("IMG_SRC", src);
  console.log("HAS_MIX_BLEND", /mix-blend-multiply/.test(h));
  console.log("HAS_ISOLATE", /\bisolate\b/.test(h));
  console.log("HAS_BG_WHITE70", /bg-white\/70/.test(h));
  console.log("HAS_BG_TRANSPARENT", /bg-transparent/.test(h));

  const assetUrl =
    "https://casa-florescer-sistema-completo.vercel.app/brand/logo-florescer.png";
  const bust =
    assetUrl + "?v=diag-" + Date.now();
  const a1 = await get(assetUrl);
  const a2 = await get(bust);
  const local = fs.readFileSync("public/brand/logo-florescer.png");
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
  console.log("ASSET_STATUS", a1.status);
  console.log("ASSET_CTYPE", a1.headers["content-type"]);
  console.log("ASSET_LEN", a1.body.length);
  console.log("ASSET_ETAG", a1.headers.etag || null);
  console.log("ASSET_CACHE", a1.headers["cache-control"] || null);
  console.log("ASSET_AGE", a1.headers.age || null);
  console.log("ASSET_XVCACHE", a1.headers["x-vercel-cache"] || null);
  console.log("LOCAL_LEN", local.length);
  console.log("HASH_LOCAL", hash(local));
  console.log("HASH_PROD", hash(a1.body));
  console.log("HASH_BUST", hash(a2.body));
  console.log("HASH_MATCH_LOCAL_PROD", hash(local) === hash(a1.body));
  console.log("HASH_MATCH_BUST", hash(a1.body) === hash(a2.body));

  // PNG IHDR/color type
  const colorType = a1.body[25]; // IHDR color type at offset 25 in standard PNG
  console.log("PNG_COLOR_TYPE_BYTE", colorType, "(2=truecolor RGB no alpha, 6=RGBA)");
})();
