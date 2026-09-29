/**
 * Minimal magic-byte sniffer for the image formats the API accepts.
 *
 * Some Android gallery pickers send HEIC parts with an empty or
 * `application/octet-stream` content type, so the multipart header cannot be
 * trusted on its own. This inspects the first bytes of the buffer instead.
 */
export type SniffedImageType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif', 'heim', 'heis', 'avif']);

export function sniffImageType(
  buffer: Buffer | undefined,
): SniffedImageType | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // HEIC/HEIF: ISO BMFF "ftyp" box at offset 4, major brand at offset 8
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const majorBrand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (HEIC_BRANDS.has(majorBrand)) {
      return 'image/heic';
    }
    if (HEIF_BRANDS.has(majorBrand)) {
      return 'image/heif';
    }
    // Compatible brands follow the minor version (offset 16..boxSize)
    const boxSize = Math.min(buffer.readUInt32BE(0), buffer.length, 64);
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
      const brand = buffer.toString('ascii', offset, offset + 4).toLowerCase();
      if (HEIC_BRANDS.has(brand)) {
        return 'image/heic';
      }
      if (HEIF_BRANDS.has(brand)) {
        return 'image/heif';
      }
    }
  }

  return null;
}
