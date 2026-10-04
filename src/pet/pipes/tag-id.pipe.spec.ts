import { BadRequestException } from '@nestjs/common';
import { TagIdPipe } from './tag-id.pipe';

describe('TagIdPipe', () => {
  const pipe = new TagIdPipe();

  it('accepts a valid tag id', () => {
    expect(pipe.transform('LUNA2M4PQ')).toBe('LUNA2M4PQ');
  });

  it('normalises lowercase and whitespace', () => {
    expect(pipe.transform(' luna2m4pq ')).toBe('LUNA2M4PQ');
  });

  it.each(['', 'SHORT', 'LUNA2M4PQX', 'LUNA0M4PQ', 'LUNAIM4PQ', 'LUNA-M4PQ'])(
    'rejects %p',
    (bad) => {
      expect(() => pipe.transform(bad)).toThrow(BadRequestException);
    },
  );
});
