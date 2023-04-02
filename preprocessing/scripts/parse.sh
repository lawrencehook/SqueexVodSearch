#!/bin/bash

OIFS="$IFS"
IFS=$'\n'

for file in `ls -1 data/vtt`; do
	echo $file;
	python3 scripts/parse.py data/vtt/$file > data/parsed/${file/vtt/json}
done
