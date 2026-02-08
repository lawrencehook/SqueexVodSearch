#!/bin/bash
set -e

# Production
scp data/squeex.db lightsail:/home/bitnami/github/SqueexVodSearch/app/data/squeex.db
