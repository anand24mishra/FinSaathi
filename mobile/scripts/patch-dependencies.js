const fs = require('fs');
const path = require('path');

// 1. Patch react-native-css index.cjs files to support NativeComponentRegistry
const cssFiles = [
  path.join(__dirname, '../node_modules/react-native-css/dist/commonjs/components/index.cjs'),
  path.join(__dirname, '../node_modules/react-native-css/dist/module/components/index.cjs'),
];

for (const filePath of cssFiles) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('NativeComponentRegistry')) {
      const target = `  get VirtualViewMode() {
    return require("react-native").VirtualViewMode;
  }
};`;
      const replacement = `  get VirtualViewMode() {
    return require("react-native").VirtualViewMode;
  },
  get NativeComponentRegistry() {
    return require("react-native").NativeComponentRegistry;
  }
};

try {
  const _rnActual = require("react-native");
  module.exports = new Proxy(module.exports, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      return _rnActual[prop];
    }
  });
} catch (e) {}`;

      if (content.includes(target)) {
        content = content.replace(target, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[patch-dependencies] Patched ${path.basename(filePath)}`);
      }
    }
  }
}

// 2. Ensure fb-dotslash executable shim exists for macOS
const dotslashDir = path.join(__dirname, '../node_modules/fb-dotslash/bin/macos');
const dotslashBin = path.join(dotslashDir, 'dotslash');
if (fs.existsSync(path.dirname(dotslashDir)) && !fs.existsSync(dotslashBin)) {
  fs.mkdirSync(dotslashDir, { recursive: true });
  fs.writeFileSync(dotslashBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  console.log('[patch-dependencies] Created fb-dotslash shim');
}
