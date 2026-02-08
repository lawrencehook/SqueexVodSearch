#!/bin/bash
set -e

source venv/bin/activate

python3 scripts/final.py
python3 scripts/merge.py

# Build SQLite DB from merged JSON
python3 scripts/build_db.py

# Local
cp data/final.json ../app/data/squeex.json
cp data/full.json  ../app/data/squeex_full.json
cp data/squeex.db  ../app/data/squeex.db

# Generate suggestions for the static site
python3 scripts/analyze_deviance.py
