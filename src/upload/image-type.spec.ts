import { sniffImageType } from './image-type';

function withHeader(header: number[] | string, length = 32): Buffer {
  const buf = Buffer.alloc(length);
  if (typeof header === 'string') {
    buf.write(header, 0, 'ascii');
  } else {
    Buffer.from(header).copy(buf, 0);
  }
  return buf;
}

function ftyp(majorBrand: string, compatible: string[] = []): Buffer {
  const brands = [majorBrand, 'xxxx', ...compatible]; // minor version placeholder
  const size = 8 + brands.length * 4;
  const buf = Buffer.alloc(Math.max(size, 32));
  buf.writeUInt32BE(size, 0);
  buf.write('ftyp', 4, 'ascii');
  brands.forEach((b, i) => buf.write(b, 8 + i * 4, 'ascii'));
  return buf;
}

describe('sniffImageType', () => {
  it('detects JPEG', () => {
    expect(sniffImageType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
  });

  it('detects PNG', () => {
    expect(
      sniffImageType(
        withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
  });

  it('detects WebP', () => {
    const buf = withHeader('RIFF');
    buf.write('WEBP', 8, 'ascii');
    expect(sniffImageType(buf)).toBe('image/webp');
  });

  it('detects HEIC by major brand', () => {
    expect(sniffImageType(ftyp('heic'))).toBe('image/heic');
  });

  it('detects HEIF by compatible brand when major brand is generic', () => {
    expect(sniffImageType(ftyp('mif1', ['heic']))).toBe('image/heif');
  });

  it('returns null for unknown bytes', () => {
    expect(sniffImageType(Buffer.alloc(32))).toBeNull();
    expect(sniffImageType(withHeader('MZ'))).toBeNull();
  });

  it('returns null for empty or tiny buffers', () => {
    expect(sniffImageType(undefined)).toBeNull();
    expect(sniffImageType(Buffer.alloc(4))).toBeNull();
  });
});
