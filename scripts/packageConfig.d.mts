export type PackagePlatform = 'current' | 'mac' | 'win';

export interface PackageCommand {
  readonly platform: PackagePlatform;
  readonly args: string[];
  readonly signingNotes: string[];
}

export function buildPackageCommand(platform: PackagePlatform, env?: NodeJS.ProcessEnv): PackageCommand;
