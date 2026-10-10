#!/bin/bash
# Builds a clean copy of the CRM in _site/ for Netlify.
# Leaves out the starting data (leads, client notes, team), the database files and the README.
# The live site reads all of that from the database behind your login instead.
set -e
cd "$(dirname "$0")"
rm -rf _site && mkdir _site
rsync -a \
  --exclude='seed*.js' --exclude='_*' --exclude='*.zip' --exclude='.git' --exclude='.gitignore' --exclude='.claude' \
  --exclude='supabase' --exclude='README.md' --exclude='build-seed.js' --exclude='deploy.sh' --exclude='tools' \
  ./ _site/
echo "Built _site/ with:"; (cd _site && find . -type f | sort)
