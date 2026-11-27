#!/usr/bin/env bash
# Builds or updates the F-Droid repo in $PAGES from the APKs in $APKS.
# Run by CI (.github/workflows/android.yml, job fdroid-repo). To try it by hand:
#   keytool -genkey -keystore /tmp/t.jks -alias rimelight-repo -keyalg RSA -keysize 4096 \
#     -validity 36500 -storepass testpass123 -keypass testpass123 -dname "CN=test"
#   PAGES=/tmp/pages APKS=/dir/with/apks KEYSTORE=/tmp/t.jks STORE_PASS=testpass123 \
#     REPO_SLUG=Rimelight-app/Rimelight android/tools/fdroid/publish.sh
# Needs fdroidserver (pip install fdroidserver) and apksigner on PATH or in $ANDROID_HOME.
set -euo pipefail

: "${PAGES:?}" "${APKS:?}" "${KEYSTORE:?}" "${STORE_PASS:?}" "${REPO_SLUG:?}"
APP_ID=com.tonihk00.clearplay
ANDROID_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OWNER="${REPO_SLUG%%/*}"
NAME="${REPO_SLUG##*/}"
REPO_URL="https://${OWNER,,}.github.io/${NAME}/repo"

APKSIGNER="$(command -v apksigner || true)"
if [ -z "$APKSIGNER" ] && [ -n "${ANDROID_HOME:-}" ]; then
  APKSIGNER="$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)"
fi
[ -x "$APKSIGNER" ] || { echo "apksigner not found" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$PAGES/repo" "$WORK/metadata/$APP_ID"
cp "$APKS"/*.apk "$PAGES/repo/"
ln -s "$PAGES/repo" "$WORK/repo"
cp -r "$ANDROID_DIR/fastlane/metadata/android/." "$WORK/metadata/$APP_ID/"

cat > "$WORK/metadata/$APP_ID.yml" <<YML
Categories:
  - Multimedia
License: MIT
WebSite: https://github.com/${REPO_SLUG}
SourceCode: https://github.com/${REPO_SLUG}
IssueTracker: https://github.com/${REPO_SLUG}/issues
Changelog: https://github.com/${REPO_SLUG}/blob/android/android/CHANGELOG.md
YML

cat > "$WORK/config.yml" <<YML
repo_url: ${REPO_URL}
repo_name: Rimelight
repo_description: Rimelight for Android, built and signed by the project itself.
repo_keyalias: rimelight-repo
keystore: ${KEYSTORE}
keystorepass: '${STORE_PASS}'
keypass: '${STORE_PASS}'
keydname: CN=Rimelight F-Droid repo, O=Rimelight
apksigner: ${APKSIGNER}
YML
chmod 600 "$WORK/config.yml"

(cd "$WORK" && fdroid update)

touch "$PAGES/.nojekyll"
echo "Repo: $REPO_URL"
