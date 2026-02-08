#!/bin/bash

# Extract known video IDs from existing JSON to skip already-processed videos.
echo "Extracting known video IDs from squeex.json..."
jq -r '.meta | keys[]' ../app/data/squeex.json > data/known_ids.txt
echo "Found $(wc -l < data/known_ids.txt) known videos."

cat data/urls.txt | while read url; do
  echo
  vid_id=${url#*v=}
  echo $vid_id

  # Check for existing subtitle files.
  if find "data/vtt" -type f -name "*${vid_id}*" | grep -q .; then
    ls data/vtt/*${vid_id}*
    echo "Match found in local VTT files!"
    continue;
  fi

  # Check if already processed in the existing JSON data.
  if grep -q "$vid_id" data/known_ids.txt; then
    echo "Match found in existing JSON data!"
    continue;
  fi

  # check if the video is accessible.
  yt-dlp --print "%(id)s" $url
  if [ $? -ne 0 ]; then
    echo "Skipping..."
    continue
  fi

  echo "No match found."

  echo `yt-dlp --print "%(id)s:%(upload_date)s" $url` >> data/dates.txt
  yt-dlp --write-auto-subs --skip-download $url
  mv *.vtt data/vtt

done

sort -u data/dates.txt > tmp
grep "\S" tmp > data/dates.txt
rm tmp
