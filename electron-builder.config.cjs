const appId = process.env.APP_ID || 'com.mangowork.codexdesktop';
const productName = process.env.PRODUCT_NAME || 'Codex Desktop';
const hasWindowsSigning = Boolean(
  process.env.WIN_CSC_LINK ||
  process.env.CSC_LINK ||
  process.env.WIN_CSC_NAME ||
  process.env.CSC_NAME
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId,
  productName,
  copyright: `Copyright (c) ${new Date().getFullYear()} MangoWork`,
  directories: {
    output: 'release'
  },
  files: [
    'dist/main/**/*',
    'dist/preload/**/*',
    'dist/renderer/**/*',
    'package.json'
  ],
  extraMetadata: {
    main: 'dist/main/main.js'
  },
  asar: true,
  compression: 'maximum',
  npmRebuild: false,
  publish: null,
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    minimumSystemVersion: '11.0',
    notarize: true,
    target: [
      {
        target: 'dmg',
        arch: ['universal']
      },
      {
        target: 'zip',
        arch: ['universal']
      }
    ]
  },
  dmg: {
    artifactName: '${productName}-${version}-${arch}.${ext}'
  },
  win: {
    requestedExecutionLevel: 'asInvoker',
    signExecutable: hasWindowsSigning,
    signtoolOptions: {
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      timeStampServer: 'http://timestamp.digicert.com'
    },
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'arm64']
      }
    ]
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: productName,
    artifactName: '${productName}-Setup-${version}-${arch}.${ext}'
  }
};
