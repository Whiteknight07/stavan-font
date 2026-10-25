#!/bin/sh
# Assemble the static site (playground + font files) into _site/.
set -e
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site
cp -R site/. _site/
rm -rf _site/dist _site/write.mjs _site/og.html
mkdir -p _site/dist
cp dist/*.ttf dist/*.woff dist/*.woff2 dist/*.svg dist/stavan.css dist/notes-vs-font.png _site/dist/
# the library is also served at the root for short import URLs
cat > _site/_headers <<'H'
/*
  X-Content-Type-Options: nosniff
/dist/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=86400
/data/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=86400
/stavan.js
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
H
echo "site assembled in _site/"
