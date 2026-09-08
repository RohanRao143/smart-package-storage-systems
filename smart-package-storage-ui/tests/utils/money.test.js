import {
  describe,
  expect,
  it,
} from 'vitest';

import { money } from '../../src/App';

describe('money', () => {
  it('formats integer cents as currency', () => {
    expect(money(100))
      .toMatch(/\$1\.00/);
  });

  it('formats zero correctly', () => {
    expect(money(0))
      .toMatch(/\$0\.00/);
  });

  it('does not interpret cents as whole currency units', () => {
    expect(money(12345))
      .toMatch(/\$123\.45/);
  });
});