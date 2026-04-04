// アイコン生成スクリプト
// 実行: node scripts/generate-icons.mjs
// 必要: npm install -g sharp  (または npm install sharp)

import { createCanvas } from "canvas"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "../public/icons")

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext("2d")

  // 背景（ネイビー）
  ctx.fillStyle = "#0f1f3d"
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.18)
  ctx.fill()

  // 「B」文字（ゴールド）
  ctx.fillStyle = "#e2c060"
  ctx.font = `bold ${size * 0.55}px serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("B", size / 2, size / 2 + size * 0.03)

  return canvas.toBuffer("image/png")
}

for (const size of [192, 512]) {
  const buf = drawIcon(size)
  const file = path.join(outDir, `icon-${size}.png`)
  fs.writeFileSync(file, buf)
  console.log(`✓ ${file}`)
}
