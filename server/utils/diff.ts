import { readFile, writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

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
