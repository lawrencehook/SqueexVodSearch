#!/bin/bash

yt-dlp --flat-playlist --print '%(original_url)s' --match-filter 'original_url!*=/shorts/ & url!*=/shorts/' https://www.youtube.com/@SqueexVODs > data/urls.txt


## Backup method:
## Open the videos page on a channel and use the console.
# links = Array.from(document.querySelectorAll('ytd-rich-grid-renderer a[href^="/watch"]')).map(a => a.getAttribute('href'));
# links = Array.from(new Set(links));
# links.join('\n');
