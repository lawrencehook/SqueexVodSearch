#!/bin/bash
set -e

python3 scripts/final.py
aws s3 cp data/final.json s3://squeex.json
aws s3 cp data/full.json  s3://squeex_full.json
