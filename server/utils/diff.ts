import { readFile, writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const THUMB_SIZE = 1200
const THUMB_BORDER = 6

const BORDER_COLOR_A = [34, 197, 94] as const   // #22c55e green
const BORDER_COLOR_B = [56, 189, 248] as const   // #38bdf8 blue
const BORDER_THICKNESS = 6

export async function generateThumbnail(aPath: string, bPath: string, outPath: string): Promise<void> {
  const [aBuf, bBuf] = await Promise.all([readFile(aPath), readFile(bPath)])
  const a = PNG.sync.read(aBuf)
  const b = PNG.sync.read(bBuf)

  const W = THUMB_SIZE
  const H = THUMB_SIZE
  const halfW = Math.floor(W / 2)
  const B = BORDER_THICKNESS
  const out = new PNG({ width: W, height: H })

  // Left panel: x in [0, halfW), image region [B, halfW-B)×[B, H-B)
  // Right panel: x in [halfW, W), image region [halfW+B, W-B)×[B, H-B)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dstIdx = (y * W + x) * 4
      const isLeft = x < halfW

      const inLeftBorder  = isLeft  && (x < B || x >= halfW - B || y < B || y >= H - B)
      const inRightBorder = !isLeft && (x < halfW + B || x >= W - B || y < B || y >= H - B)

      if (inLeftBorder) {
        out.data[dstIdx]     = BORDER_COLOR_A[0]
        out.data[dstIdx + 1] = BORDER_COLOR_A[1]
        out.data[dstIdx + 2] = BORDER_COLOR_A[2]
        out.data[dstIdx + 3] = 255
        continue
      }

      if (inRightBorder) {
        out.data[dstIdx]     = BORDER_COLOR_B[0]
        out.data[dstIdx + 1] = BORDER_COLOR_B[1]
        out.data[dstIdx + 2] = BORDER_COLOR_B[2]
        out.data[dstIdx + 3] = 255
        continue
      }

      // Image pixels
      // Left panel shows the LEFT half of A (srcX: 0 .. src.width/2)
      // Right panel shows the RIGHT half of B (srcX: src.width/2 .. src.width)
      const src = isLeft ? a : b
      const cropW = src.width        // full screenshot width
      const cropH = src.width        // square top-crop height = width

      const innerW = halfW - B * 2   // usable pixel columns per panel
      const innerH = H - B * 2       // usable pixel rows

      let srcX: number
      if (isLeft) {
        const col = x - B
        srcX = Math.floor((col / innerW) * (cropW / 2))
      } else {
        const col = x - halfW - B
        srcX = Math.floor(cropW / 2 + (col / innerW) * (cropW / 2))
      }

      const row = y - B
      const srcY = Math.floor((row / innerH) * cropH)

      const clampedX = Math.max(0, Math.min(src.width - 1, srcX))
      const clampedY = Math.max(0, Math.min(src.height - 1, srcY))

      const srcIdx = (clampedY * src.width + clampedX) * 4
      out.data[dstIdx]     = src.data[srcIdx]
      out.data[dstIdx + 1] = src.data[srcIdx + 1]
      out.data[dstIdx + 2] = src.data[srcIdx + 2]
      out.data[dstIdx + 3] = src.data[srcIdx + 3]
    }
  }

  await writeFile(outPath, PNG.sync.write(out))
}

export async function diffPngs(aPath: string, bPath: string, outPath: string) {
  const [aBuf, bBuf] = await Promise.all([readFile(aPath), readFile(bPath)])
  const a = PNG.sync.read(aBuf)
  const b = PNG.sync.read(bBuf)

  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)

  const aPad = padTo(a, width, height)
  const bPad = padTo(b, width, height)

  const diff = new PNG({ width, height })
  const mismatched = pixelmatch(aPad.data, bPad.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: true,
    alpha: 0.3
  })
  const total = width * height
  const percent = (mismatched / total) * 100

  await writeFile(outPath, PNG.sync.write(diff))
  return { width, height, mismatched, percent }
}

function padTo(src: PNG, w: number, h: number): PNG {
  if (src.width === w && src.height === h) return src
  const out = new PNG({ width: w, height: h })
  // fill with transparent black
  out.data.fill(0)
  for (let y = 0; y < src.height; y++) {
    const srcStart = y * src.width * 4
    const dstStart = y * w * 4
    src.data.copy(out.data, dstStart, srcStart, srcStart + src.width * 4)
  }
  return out
}
