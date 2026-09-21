#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then echo 'usage: build-acceptance.sh sdk.tgz output-directory' >&2; exit 1; fi
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
artifact="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
mkdir -p "$2"
output="$(cd "$2" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$repo_dir/acceptance/package.json" "$work/"
cp "$artifact" "$work/published-sdk.tgz"
mkdir -p "$work/acceptance" "$work/__tests__" "$work/scripts" "$work/docs"
cp "$repo_dir/acceptance/realtime.test.cjs" "$work/acceptance/"
cp -R "$repo_dir/__tests__/contract" "$work/__tests__/"
cp "$repo_dir/__tests__/node-environment.cjs" "$work/__tests__/"
cp -R "$repo_dir/features" "$work/"
cp "$repo_dir/jest.contract.config.cjs" "$work/"
cp "$repo_dir/scripts/jest-completeness.cjs" "$repo_dir/scripts/test-package-quickstart.mjs" "$work/scripts/"
cp "$repo_dir/docs/getting-started.md" "$work/docs/"
cd "$work"
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node - <<'JS'
const fs = require('node:fs');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync('node_modules/@volcano.dev/sdk/package.json'));
if (manifest.name !== '@volcano.dev/sdk') throw new Error('Unexpected SDK package');
if (!require.resolve('@volcano.dev/sdk').startsWith(process.cwd() + '/node_modules/')) throw new Error('SDK source shadowing');
fs.writeFileSync('acceptance.json', JSON.stringify({schema: 1, language: 'javascript', package: manifest.name, version: manifest.version, filename: 'published-sdk.tgz', sha256: crypto.createHash('sha256').update(fs.readFileSync('published-sdk.tgz')).digest('hex')}, null, 2));
JS
npm run test:contract -- --runTestsByPath __tests__/contract/world.test.js
npm run test:contract -- --runTestsByPath acceptance/realtime.test.cjs --testMatch '**/acceptance/*.test.cjs'
node scripts/test-package-quickstart.mjs published-sdk.tgz
rm -rf node_modules reports published-sdk.tgz
tar -czf "$output/sdk-acceptance.tar.gz" .
