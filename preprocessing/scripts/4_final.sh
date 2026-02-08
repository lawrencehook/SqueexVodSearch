#!/bin/bash
set -e

python3 scripts/final.py

# Local
cp data/final.json ../app/data/squeex.json
cp data/full.json  ../app/data/squeex_full.json

# Generate suggestions for the static site
python3 scripts/analyze_deviance.py
