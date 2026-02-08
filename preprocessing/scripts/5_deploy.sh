#!/bin/bash
set -e

# Production
scp data/final.json lightsail:/home/bitnami/github/SqueexVodSearch/app/data/squeex.json
scp data/full.json  lightsail:/home/bitnami/github/SqueexVodSearch/app/data/squeex_full.json
scp ../suggestions.json lightsail:/home/bitnami/github/SqueexVodSearch/suggestions.json

ssh lightsail "bash /home/bitnami/github/deployments/run"
