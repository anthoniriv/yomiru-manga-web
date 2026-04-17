#!/bin/bash
set -e
cd /Users/anthonirivera/DEV/yomiru
rclone copy storage/media/manga r2:yomiru-mangas/manga \
  --transfers 16 --checkers 32 --fast-list --progress --stats 30s
