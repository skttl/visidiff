import sharp from 'sharp';

export async function padImagesToSameHeight(
  a: Buffer,
  b: Buffer,
  heightA: number,
  heightB: number,
): Promise<[Buffer, Buffer]> {
  if (heightA === heightB) return [a, b];
  const target = Math.max(heightA, heightB);
  if (heightA < target) {
    const meta = await sharp(a).metadata();
    const padded = await sharp(a)
      .extend({
        top: 0,
        bottom: target - heightA,
        left: 0,
        right: 0,
        background: '#ffffff',
      })
      .toBuffer();
    return [padded, b];
  }
  const meta = await sharp(b).metadata();
  const padded = await sharp(b)
    .extend({
      top: 0,
      bottom: target - heightB,
      left: 0,
      right: 0,
      background: '#ffffff',
    })
    .toBuffer();
  return [a, padded];
}
