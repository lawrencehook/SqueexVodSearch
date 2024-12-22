#!/bin/bash
set -e

# Production
scp data/final.json lightsail:/home/bitnami/github/SqueexVodSearch/app/data/squeex.json
scp data/full.json  lightsail:/home/bitnami/github/SqueexVodSearch/app/data/squeex_full.json
