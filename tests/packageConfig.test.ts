import { describe, expect, it } from 'vitest';
import { buildPackageCommand } from '../scripts/packageConfig.mjs';

describe('buildPackageCommand', () => {
  it('builds a universal macOS package command', () => {
    const command = buildPackageCommand('mac', {});

    expect(command.args).toEqual(['electron-builder', '--config', 'electron-builder.config.cjs', '--mac', '--universal']);
  });

  it('builds Windows package command for common Intel and Arm machines', () => {
    const command = buildPackageCommand('win', {});

    expect(command.args).toEqual(['electron-builder', '--config', 'electron-builder.config.cjs', '--win', '--x64', '--arm64']);
  });

  it('warns when signing environment variables are missing', () => {
    const command = buildPackageCommand('current', {});

    expect(command.signingNotes).toContain('macOS signing is not configured. Set CSC_LINK or CSC_NAME to produce a Developer ID signed app. Automatic certificate discovery will be disabled for this run.');
    expect(command.signingNotes).toContain('macOS notarization is not configured. Set Apple notarization environment variables before release builds.');
    expect(command.signingNotes).toContain('Windows signing is not configured. Set WIN_CSC_LINK or WIN_CSC_NAME to sign release installers. Automatic certificate discovery will be disabled for this run.');
  });

  it('does not warn when signing and notarization variables are present', () => {
    const command = buildPackageCommand('current', {
      APPLE_API_ISSUER: 'issuer-id',
      APPLE_API_KEY: '/secure/AuthKey.p8',
      APPLE_API_KEY_ID: 'key-id',
      CSC_LINK: '/secure/mac-cert.p12',
      WIN_CSC_LINK: '/secure/windows-cert.pfx'
    });

    expect(command.signingNotes).toEqual([]);
  });
});
