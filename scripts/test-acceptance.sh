#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then echo 'usage: test-acceptance.sh package-file sdk-acceptance.tar.gz' >&2; exit 1; fi
artifact="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
bundle="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xzf "$bundle" -C "$work"
cd "$work"
cp "$artifact" published-sdk.tgz
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),a=require("./acceptance.json");if(crypto.createHash("sha256").update(fs.readFileSync("published-sdk.tgz")).digest("hex")!==a.sha256)throw Error("Package differs from acceptance bundle")'
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node -e 'if(!require.resolve("@volcano.dev/sdk").startsWith(process.cwd()+"/node_modules/"))throw Error("SDK source shadowing")'
npm run test:contract -- --runTestsByPath __tests__/contract/world.test.js
npm run test:contract -- --runTestsByPath acceptance/realtime.test.cjs --testMatch '**/acceptance/*.test.cjs'
node scripts/test-package-quickstart.mjs published-sdk.tgz
