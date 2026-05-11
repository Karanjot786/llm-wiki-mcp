import { describe, it, expect } from 'vitest';
import { computeHealthScore } from '../../tools/health.js';
import type { LintIssue } from '../../types.js';

describe('health tool helpers', () => {
  it('computeHealthScore returns 100 with no issues', () => {
    expect(computeHealthScore([], 10)).toBe(100);
  });

  it('computeHealthScore deducts for errors more than warnings', () => {
    const issues: LintIssue[] = [
      { rule: 'no-orphans', severity: 'error', path: 'pages/x.md', message: 'orphan' },
      { rule: 'needs-citation', severity: 'warning', path: 'pages/y.md', message: 'no citations' },
    ];
    const score = computeHealthScore(issues, 10);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('computeHealthScore floors at 0', () => {
    const issues: LintIssue[] = Array.from({ length: 50 }, (_, i) => ({
      rule: 'rule', severity: 'error' as const, path: `p${i}.md`, message: 'm',
    }));
    expect(computeHealthScore(issues, 5)).toBe(0);
  });
});
