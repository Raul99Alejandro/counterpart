import { describe, expect, it } from 'vitest';
import { fail, ok } from '../../src/tools/context.js';

describe('spoken tool results', () => {
  it('start with a capital letter', () => {
    expect(ok('work order 41 is now in the bay.', {}).content[0]!.text).toBe('Work order 41 is now in the bay.');
    expect(fail('work order 41 is still in the bay.').content[0]!.text).toBe('Work order 41 is still in the bay.');
  });
});
