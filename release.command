#!/bin/bash
# Minneapolis Meditation Center apps: build, test and release (Mac). Double-click in Finder, or: ./release.command build|test|prod|status
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is needed: https://nodejs.org"; read -r; exit 1; }
[ -d node_modules ] || npm install || exit 1
if [ -n "$1" ]; then node tools/release.mjs "$@"; exit; fi
echo
echo "  1  Build     - commit, run all tests, number the build, push to GitHub"
echo "  2  Test      - deploy the current build to test.sosmn.org"
echo "  3  Prod      - release notes, back up, deploy to sosmn.org"
echo "  4  Status    - what is built, on test and live"
echo "  5  Run locally (localhost:8000 / 8001)"
echo "  6  First-time set-up of test.sosmn.org (once)"
echo
read -r -p "Choose 1-6: " C
case "$C" in 1) node tools/release.mjs build;; 2) node tools/release.mjs test;; 3) node tools/release.mjs prod;; 4) node tools/release.mjs status;; 5) node tools/dev.mjs;; 6) node tools/release.mjs setup-test;; esac
read -r -p "Press Enter to close" _
