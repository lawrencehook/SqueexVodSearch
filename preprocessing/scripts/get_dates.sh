#!/bin/bash

links_file=${1:-data/js_links.txt}

cat $links_file | while read url; do
	echo $url;
	touch data/dates/`yt-dlp --print "%(id)s:%(upload_date)s" $url`
done
