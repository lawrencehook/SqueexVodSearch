#!/bin/bash
set -e

python3 scripts/final.py
cp data/final.json ../app/data/squeex.json
cp data/full.json ../app/data/squeex_full.json