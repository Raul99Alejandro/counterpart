import { describe, expect, it } from 'vitest';
import { DemoLimits } from '../../src/demo/limits.js';

const T0 = new Date('2026-11-10T15:00:00Z').getTime();
const limits = () => new DemoLimits({ sandboxesPerIpPerHour: 2, sandboxesPerDay: 3, turnsPerSandboxPerDay: 2, turnsPerDay: 3, speechPerSandboxPerDay: 2, speechPerDay: 3 });

describe('demo limits', () => {
  it('caps sandboxes per address per hour, and lets the address back in the next hour', () => {
    const l = limits();
    expect(l.takeSandbox('1.1.1.1', T0)).toBe(true);
    expect(l.takeSandbox('1.1.1.1', T0 + 1000)).toBe(true);
    expect(l.takeSandbox('1.1.1.1', T0 + 2000)).toBe(false);
    expect(l.takeSandbox('1.1.1.1', T0 + 3600_000)).toBe(true);
  });

  it('caps sandboxes per day across all addresses', () => {
    const l = limits();
    expect(l.takeSandbox('a', T0)).toBe(true);
    expect(l.takeSandbox('b', T0)).toBe(true);
    expect(l.takeSandbox('c', T0)).toBe(true);
    expect(l.takeSandbox('d', T0)).toBe(false);
    expect(l.takeSandbox('d', T0 + 24 * 3600_000)).toBe(true);
  });

  it('caps turns per sandbox and per day', () => {
    const l = limits();
    expect(l.takeTurn('s1', T0)).toBe(true);
    expect(l.takeTurn('s1', T0)).toBe(true);
    expect(l.takeTurn('s1', T0)).toBe(false);
    expect(l.takeTurn('s2', T0)).toBe(true);
    expect(l.takeTurn('s3', T0)).toBe(false);
  });

  it('does not spend the daily budget on a refused turn', () => {
    const l = limits();
    l.takeTurn('s1', T0); l.takeTurn('s1', T0);
    expect(l.takeTurn('s1', T0)).toBe(false);
    expect(l.takeTurn('s2', T0)).toBe(true);
  });

  it('caps spoken replies per sandbox and per day, apart from turns', () => {
    const l = limits();
    expect(l.takeSpeech('s1', T0)).toBe(true);
    expect(l.takeSpeech('s1', T0)).toBe(true);
    expect(l.takeSpeech('s1', T0)).toBe(false);
    expect(l.takeSpeech('s2', T0)).toBe(true);
    expect(l.takeSpeech('s3', T0)).toBe(false);
    expect(l.takeTurn('s1', T0)).toBe(true);
  });
});
