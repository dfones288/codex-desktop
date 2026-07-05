export function shouldOpenProjectOnboarding(projectCount: number, isOpen: boolean): boolean {
  return projectCount === 0 && !isOpen;
}

export function shouldBlockSendWithoutProject(projectCount: number): boolean {
  return projectCount === 0;
}

export function canContinueProjectOnboarding(projectCount: number): boolean {
  return projectCount > 0;
}
