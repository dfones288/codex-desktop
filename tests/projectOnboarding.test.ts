import { describe, expect, it } from 'vitest';
import { canContinueProjectOnboarding, shouldBlockSendWithoutProject, shouldOpenProjectOnboarding } from '../src/renderer/projectOnboarding.js';

describe('project onboarding', () => {
  it('opens when no projects are available and the modal is not already open', () => {
    expect(shouldOpenProjectOnboarding(0, false)).toBe(true);
  });

  it('does not reopen while the onboarding modal is already open', () => {
    expect(shouldOpenProjectOnboarding(0, true)).toBe(false);
  });

  it('does not open when at least one project exists', () => {
    expect(shouldOpenProjectOnboarding(1, false)).toBe(false);
  });

  it('blocks sending when no project exists', () => {
    expect(shouldBlockSendWithoutProject(0)).toBe(true);
    expect(shouldBlockSendWithoutProject(1)).toBe(false);
  });

  it('only enables continue after at least one project is selected', () => {
    expect(canContinueProjectOnboarding(0)).toBe(false);
    expect(canContinueProjectOnboarding(1)).toBe(true);
  });
});
