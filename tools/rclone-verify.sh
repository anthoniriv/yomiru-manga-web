#!/bin/bash
cd /Users/anthonirivera/DEV/yomiru
echo "=== R2 ==="
rclone size r2:yomiru-mangas/manga
echo "=== Local ==="
du -sh storage/media/manga
