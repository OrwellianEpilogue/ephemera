import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, "../public/favicon.svg");
const publicDir = join(__dirname, "../public");

const sizes = [
  // PWA icons for Android
  { name: "pwa-192x192.png", size: 192 },
  { name: "pwa-512x512.png", size: 512 },
  // Apple touch icons for iOS devices
  { name: "apple-touch-icon.png", size: 180 }, // Default (iPhone Retina)
  { name: "apple-touch-icon-152x152.png", size: 152 }, // iPad
  { name: "apple-touch-icon-180x180.png", size: 180 }, // iPhone Retina
  { name: "apple-touch-icon-167x167.png", size: 167 }, // iPad Retina
  // Standard favicons
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-16x16.png", size: 16 },
];

const svgBuffer = readFileSync(svgPath);

console.log("Generating PWA icons from favicon.svg...\n");

for (const { name, size } of sizes) {
  const outputPath = join(publicDir, name);

  await sharp(svgBuffer).resize(size, size).png().toFile(outputPath);

  console.log(`✓ Generated ${name} (${size}x${size})`);
}

console.log("\nAll icons generated successfully!");
