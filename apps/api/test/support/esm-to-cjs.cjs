// Jest runs the API tests as CommonJS, but sanitize-html's parser (htmlparser2
// and its dom* / entities dependencies) ships ES modules only. This transform
// rewrites just those files to CommonJS; Node itself loads them natively.
const ts = require("typescript");

module.exports = {
  process(source, filename) {
    const { outputText } = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true, esModuleInterop: true },
    });
    return { code: outputText };
  },
};
