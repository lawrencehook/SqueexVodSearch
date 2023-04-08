#!/bin/bash

links_file=${1:-data/js_links.txt}

cat $links_file | while read url; do
	echo $url;
	yt-dlp --write-auto-subs --skip-download $url
	echo `yt-dlp --print "%(id)s:%(upload_date)s" $url` >> data/dates.txt
done

sort -u data/dates.txt > tmp
cat tmp > data/dates.txt
rm tmp

mv *.vtt data/vtt
