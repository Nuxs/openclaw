#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/macos"

BUILD_PATH=".build-local"
PRODUCT="OpenClaw"
# Detect host triple so the script works on both ARM and Intel Macs
ARCH="$(uname -m)-apple-macosx"
BIN="$BUILD_PATH/debug/$PRODUCT"
BUNDLE="$BUILD_PATH/debug/$PRODUCT.app"

printf "\n▶️  Building $PRODUCT (debug, swift build)\n"
swift build -c debug --product "$PRODUCT" --build-path "$BUILD_PATH"

# Assemble .app bundle (Info.plist, Frameworks, Resources)
printf "\n📦 Assembling $PRODUCT.app bundle...\n"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources" "$BUNDLE/Contents/Frameworks"

cp "$BIN" "$BUNDLE/Contents/MacOS/$PRODUCT"
cp "Sources/OpenClaw/Resources/Info.plist" "$BUNDLE/Contents/Info.plist"
cp "Sources/OpenClaw/Resources/OpenClaw.icns" "$BUNDLE/Contents/Resources/" 2>/dev/null || true
cp -R "Sources/OpenClaw/Resources/DeviceModels" "$BUNDLE/Contents/Resources/" 2>/dev/null || true

# SwiftPM resource bundles
find "$BUILD_PATH/$ARCH/debug" -maxdepth 1 -name "*.bundle" -exec cp -R {} "$BUNDLE/Contents/Resources/" \; 2>/dev/null || true

# Frameworks (Sparkle etc.)
find "$BUILD_PATH/$ARCH/debug" -maxdepth 1 -name "*.framework" -exec cp -R {} "$BUNDLE/Contents/Frameworks/" \; 2>/dev/null || true
find "$BUILD_PATH/artifacts" -path "*/macos-arm64_x86_64/*.framework" -exec cp -R {} "$BUNDLE/Contents/Frameworks/" \; 2>/dev/null || true

# Add rpath so dyld finds ../Frameworks
install_name_tool -add_rpath "@executable_path/../Frameworks" "$BUNDLE/Contents/MacOS/$PRODUCT" 2>/dev/null || true

# Ad-hoc codesign so macOS treats it as a real app (UNUserNotificationCenter, etc.)
codesign --force --deep --sign - "$BUNDLE" 2>/dev/null || true

printf "\n⏹  Stopping existing $PRODUCT...\n"
killall -9 "$PRODUCT" 2>/dev/null || true
sleep 0.5

printf "\n🚀 Launching $BUNDLE ...\n"
open "$BUNDLE"
printf "Started $PRODUCT. Logs: /tmp/openclaw.log\n"
