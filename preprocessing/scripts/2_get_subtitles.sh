#!/bin/bash

# existing_meta=`cat ../app/data/squeex.json | jq ".meta"`;

cat data/urls.txt | while read url; do
  echo
  vid_id=${url#*v=}
  echo $vid_id

  # Check for existing subtitle files.
  if find "data/vtt" -type f -name "*${vid_id}*" | grep -q .; then
    ls data/vtt/*${vid_id}*
    echo "Match found!"
    continue;
  fi

  # # Check the json for existing results.
  # result=`echo $existing_meta | jq ".${vid_id}" | jq -r type`
  # if [ $result = "object" ]; then
  #   echo "Match found!"
  #   continue;
  # fi

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
