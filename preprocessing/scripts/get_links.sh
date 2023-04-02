#!/bin/bash

yt-dlp --print "%(original_url)s" --match-filter "original_url!*=/shorts/" https://www.youtube.com/@SqueexVODs
