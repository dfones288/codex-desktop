/**
 * @typedef {'current' | 'mac' | 'win'} PackagePlatform
 *
 * @typedef {object} PackageCommand
 * @property {PackagePlatform} platform
 * @property {string[]} args
 * @property {string[]} signingNotes
 */

/**
 * @param {PackagePlatform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {PackageCommand}
 */
export function buildPackageCommand(platform, env = process.env) {
  return {
    platform,
    args: buildArgs(platform),
    signingNotes: buildSigningNotes(platform, env)
  };
}

/**
 * @param {PackagePlatform} platform
 * @returns {string[]}
 */
function buildArgs(platform) {
  const baseArgs = ['electron-builder', '--config', 'electron-builder.config.cjs'];

  if (platform === 'mac') {
    return [...baseArgs, '--mac', '--universal'];
  }

  if (platform === 'win') {
    return [...baseArgs, '--win', '--x64', '--arm64'];
  }

  return baseArgs;
}

/**
 * @param {PackagePlatform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function buildSigningNotes(platform, env) {
  const notes = [];

  if (platform === 'mac' || platform === 'current') {
    const hasMacSigning = Boolean(env.CSC_LINK || env.CSC_NAME);
    const hasNotarization = hasAppleApiKeyNotarization(env) || hasAppleIdNotarization(env) || hasKeychainNotarization(env);

    if (!hasMacSigning) {
      notes.push('macOS signing is not configured. Set CSC_LINK or CSC_NAME to produce a Developer ID signed app. Automatic certificate discovery will be disabled for this run.');
    }

    if (!hasNotarization) {
      notes.push('macOS notarization is not configured. Set Apple notarization environment variables before release builds.');
    }
  }

  if (platform === 'win' || platform === 'current') {
    const hasWindowsSigning = Boolean(env.WIN_CSC_LINK || env.CSC_LINK || env.WIN_CSC_NAME || env.CSC_NAME);

    if (!hasWindowsSigning) {
      notes.push('Windows signing is not configured. Set WIN_CSC_LINK or WIN_CSC_NAME to sign release installers. Automatic certificate discovery will be disabled for this run.');
    }
  }

  return notes;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function hasAppleApiKeyNotarization(env) {
  return Boolean(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function hasAppleIdNotarization(env) {
  return Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function hasKeychainNotarization(env) {
  return Boolean(env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE);
}
