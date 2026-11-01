/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ADR_PATH = path.resolve(ROOT, 'docs', 'adr-005.md');

describe('PA6 ADR public tests', () => {
  jest.setTimeout(30000);

  let adrContent;

  beforeAll(() => {
    adrContent = fs.readFileSync(ADR_PATH, 'utf8');
  });

  test('1) adr-005.md exists and is non-empty', () => {
    expect(fs.existsSync(ADR_PATH)).toBe(true);
    expect(adrContent.trim().length).toBeGreaterThan(0);
  });

  test('2) ADR contains required sections', () => {
    const lower = adrContent.toLowerCase();
    expect(lower).toContain('context');
    expect(lower).toContain('decision');
    expect(lower).toContain('consequences');
  });

  test('3) ADR has a status field', () => {
    expect(adrContent.toLowerCase()).toMatch(/status\W+(accepted|proposed|deprecated|superseded)/i);
  });

  test('4) ADR is substantive (not a stub)', () => {
    // Minimum word count to ensure the ADR is not just section headers
    const wordCount = adrContent.split(/\s+/).filter(w => w.length > 0).length;
    expect(wordCount).toBeGreaterThan(100);
  });

  test('5) ADR mentions key implementation decisions', () => {
    const lower = adrContent.toLowerCase();
    // Should discuss at least some of: timeout, compensation, idempotency
    const mentionsTimeout = lower.includes('timeout');
    const mentionsCompensation = lower.includes('compensat');
    const mentionsIdempotency = lower.includes('idempoten');
    const decisionsMentioned = [mentionsTimeout, mentionsCompensation, mentionsIdempotency]
      .filter(Boolean).length;
    expect(decisionsMentioned).toBeGreaterThanOrEqual(2);
  });
});

