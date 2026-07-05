export interface BranchSearchItem {
  name: string;
  current: boolean;
}

export function filterBranches<T extends BranchSearchItem>(branches: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return branches;
  return branches.filter((branch) => branch.name.toLowerCase().includes(normalized));
}
