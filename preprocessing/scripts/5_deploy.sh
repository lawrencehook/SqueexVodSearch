#!/bin/bash
set -e

# Production
scp data/squeex.db lightsail:/home/ec2-user/github/SqueexVodSearch/app/data/squeex.db
