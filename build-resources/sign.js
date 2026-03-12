// Code Signing Configuration for Enterprise Deployments
//
// To enable code signing:
// 1. Set signAndEditExecutable to true in package.json (build.win)
// 2. Set these environment variables before running `npm run package`:
//    - CSC_LINK: Path to your .pfx code signing certificate
//    - CSC_KEY_PASSWORD: Certificate password
//
// Example:
//   set CSC_LINK=C:\certs\my-code-signing.pfx
//   set CSC_KEY_PASSWORD=mypassword
//   npm run package
//
// For Azure SignTool or other external signers, configure the
// "sign" function below and reference this file in electron-builder config.
//
// See: https://www.electron.build/code-signing

exports.default = async function sign(configuration) {
  // Uncomment and configure for custom signing:
  //
  // const { execSync } = require('child_process');
  // execSync(`signtool sign /f "${process.env.CSC_LINK}" /p "${process.env.CSC_KEY_PASSWORD}" /tr http://timestamp.digicert.com /td sha256 /fd sha256 "${configuration.path}"`, {
  //   stdio: 'inherit',
  // });

  console.log(`[sign.js] Code signing not configured — skipping: ${configuration.path}`);
};
