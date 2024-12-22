#!/bin/bash

OIFS="$IFS"
IFS=$'\n'

for file in `ls -1 data/vtt/*.vtt`; do
	echo $file;
	output=${file/data\/vtt/data\/parsed};
	output=${output/en.vtt/en.json};
	python3 scripts/parse.py $file > $output;
done
