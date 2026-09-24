#!/usr/bin/env bash
set -euo pipefail

mkdir -p build/assets build/segments build/out
cd build

# High-quality Russian narration generated earlier
A1='https://dnznrvs05pmza.cloudfront.net/text_to_speech/d22c4167-8653-4d64-89d2-d26e82e9d48a/________________________________.mp3?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiMGVhMzM5MTFkZGMzMTQxMSIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5MDQxMDAwMX0.lyovltQb-VjWgd_ElvR1sODdVf8U5VVuSrB3lHAHD5Q'
A2='https://dnznrvs05pmza.cloudfront.net/text_to_speech/cc8eece3-62fd-448f-b187-aa70acbe5fa9/________________________2.mp3?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNzgxZGQ3NGQ2NDVkMjk3MSIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5MDQwODc4MX0.M6GpE_dy8pyTN8vRtpyETNCzIMvBr7SoMPgAHSW6xgM'
A3='https://dnznrvs05pmza.cloudfront.net/text_to_speech/b2c8bdc1-cc1e-45ef-b0a5-36e1c0ae8669/________________________3.mp3?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiMzdjNzgxOTU1NTllNTM0NCIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5MDQwNDExN30.t44k1aWqzKITTZW_55cVjvKDWplZRAFOaemxtCBNZXo'
A4='https://dnznrvs05pmza.cloudfront.net/text_to_speech/eccbc6b8-8189-4164-8b17-4ff66e67be72/________________________4.mp3?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiMzBkMDAwYjE1M2Y1NWQ2YyIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5MDQxOTYzM30.jX6m14AP-3E05TiYudtTmpc5DBz9q7fXJtyqX8ENFL4'

for n in 1 2 3 4; do
  urlvar="A$n"
  curl -L --fail --retry 4 --retry-delay 2 -A 'Mozilla/5.0' "${!urlvar}" -o "assets/voice_${n}.mp3"
done

# Free/licensed documentary imagery from Wikimedia Commons.
declare -a IMG_URLS=(
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Krasnaya%20Sloboda%20from%20the%20bridge.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Grand%20Synagogue%2C%20Krasnaya%20Sloboda.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20first%20museum%20of%20mountain%20jews%20in%20Azerbaijan.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Mountain%20Jews%20Guba.jpg?width=1800'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Mountain%20jewish%20men.jpg?width=1400'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Old%20Synagogue%2C%20Krasnaya%20Sloboda.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Hilaki%20Synagogue%2C%20Krasnaya%20Sloboda.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/House%20with%20balconies%2C%20Krasnaya%20Sloboda.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Red%20Town.jpg?width=2200'
  'https://commons.wikimedia.org/wiki/Special:Redirect/file/Chaykhana%20in%20red%20village.jpg?width=2200'
)
declare -a LABELS=(
  'Красная Слобода и Гудиалчай'
  'Шестикупольная синагога'
  'Музей горских евреев'
  'АРХИВ · школа горских евреев · начало 1920-х'
  'АРХИВ · горские евреи Кавказа · около 1900'
  'Старая синагога Красной Слободы'
  'Синагога Гиляки'
  'Жилая архитектура Красной Слободы'
  'Qırmızı Qəsəbə · современный вид'
  'Повседневная жизнь Красной Слободы'
)
declare -a CREDITS=(
  'Ymblanter · CC BY-SA 4.0'
  'Ymblanter · CC BY-SA 4.0'
  'Asif Masimov · CC BY-SA 3.0'
  'A. Naor · Public Domain'
  'Jewish Encyclopedia · Public Domain'
  'Ymblanter · CC BY-SA 4.0'
  'Ymblanter · CC BY-SA 4.0'
  'Ymblanter · CC BY-SA 4.0'
  'Wikimedia Commons'
  'Wikimedia Commons'
)

for i in "${!IMG_URLS[@]}"; do
  idx=$((i+1))
  curl -L --fail --retry 4 --retry-delay 2 -A 'Mozilla/5.0' "${IMG_URLS[$i]}" -o "assets/img_${idx}.jpg" || true
done

# Validate/fallback any missing image to the first successfully downloaded image.
first_img=''
for f in assets/img_*.jpg; do
  if [ -s "$f" ] && ffprobe -v error "$f" >/dev/null 2>&1; then first_img="$f"; break; fi
done
if [ -z "$first_img" ]; then
  echo "No image assets downloaded" >&2
  exit 1
fi
for i in $(seq 1 10); do
  if ! [ -s "assets/img_${i}.jpg" ] || ! ffprobe -v error "assets/img_${i}.jpg" >/dev/null 2>&1; then
    cp "$first_img" "assets/img_${i}.jpg"
  fi
done

# Merge and master narration.
ffmpeg -y -hide_banner -loglevel error   -i assets/voice_1.mp3 -i assets/voice_2.mp3 -i assets/voice_3.mp3 -i assets/voice_4.mp3   -filter_complex "[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1,highpass=f=70,lowpass=f=15500,loudnorm=I=-16:LRA=7:TP=-1.5[a]"   -map "[a]" -c:a aac -b:a 192k assets/narration.m4a

VOICE_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 assets/narration.m4a)
echo "Voice duration: $VOICE_DUR"

FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# Create a polished 18-second Ken Burns segment for each image.
for i in $(seq 1 10); do
  label="${LABELS[$((i-1))]}"
  credit="${CREDITS[$((i-1))]}"
  # Escape punctuation that drawtext treats specially.
  label_esc=$(printf '%s' "$label" | sed "s/:/\\\\:/g; s/'/’/g")
  credit_esc=$(printf '%s' "$credit" | sed "s/:/\\\\:/g; s/'/’/g")
  ffmpeg -y -hide_banner -loglevel error -loop 1 -t 18 -i "assets/img_${i}.jpg"     -filter_complex "[0:v]split=2[bg][fg];       [bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=26,eq=brightness=-0.18:saturation=0.85[bg2];       [fg]scale=1800:980:force_original_aspect_ratio=decrease[fg2];       [bg2][fg2]overlay=(W-w)/2:(H-h)/2,zoompan=z='min(zoom+0.00035,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=450:s=1920x1080:fps=25,       eq=contrast=1.025:saturation=1.02,unsharp=5:5:0.22:5:5:0.0,       drawbox=x=0:y=ih-142:w=iw:h=142:color=black@0.42:t=fill,       drawtext=fontfile=$FONTB:text='${label_esc}':fontcolor=white:fontsize=34:x=60:y=h-112,       drawtext=fontfile=$FONT:text='${credit_esc}':fontcolor=0xD6BD7B:fontsize=22:x=62:y=h-65,       fade=t=in:st=0:d=0.8,fade=t=out:st=17.2:d=0.8[v]"     -map "[v]" -an -c:v libx264 -profile:v high -level 4.1 -preset veryfast -crf 18 -pix_fmt yuv420p "segments/s_${i}.mp4"
done

# Build repeated visual timeline long enough for the full narration.
: > visuals.txt
reps=$(python3 - <<PY
import math
d=float("$VOICE_DUR")
print(math.ceil(d/(10*18))+1)
PY
)
for _ in $(seq 1 "$reps"); do
  for i in $(seq 1 10); do echo "file 'segments/s_${i}.mp4'" >> visuals.txt; done
done
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i visuals.txt -t "$VOICE_DUR" -c copy assets/main_visual.mp4

# Opening title 8 seconds.
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=0x080b0f:s=1920x1080:r=25:d=8"   -vf "drawtext=fontfile=$FONTB:text='КРАСНАЯ СЛОБОДА':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=315,        drawtext=fontfile=$FONT:text='ПАМЯТЬ КАВКАЗА':fontcolor=0xD6BD7B:fontsize=46:x=(w-text_w)/2:y=435,        drawtext=fontfile=$FONT:text='Документальный фильм о горских евреях Кавказа':fontcolor=0xD0D0D0:fontsize=30:x=(w-text_w)/2:y=535,        drawtext=fontfile=$FONTB:text='Создатель проекта — Давидов Дон Сережович':fontcolor=white:fontsize=31:x=(w-text_w)/2:y=680,        fade=t=in:st=0:d=1,fade=t=out:st=7:d=1"   -an -c:v libx264 -profile:v high -preset veryfast -crf 18 -pix_fmt yuv420p assets/intro.mp4

# End credits 14 seconds.
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "color=c=0x060708:s=1920x1080:r=25:d=14"   -vf "drawtext=fontfile=$FONTB:text='КРАСНАЯ СЛОБОДА · ПАМЯТЬ КАВКАЗА':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=210,        drawtext=fontfile=$FONTB:text='Создатель проекта':fontcolor=0xD6BD7B:fontsize=28:x=(w-text_w)/2:y=345,        drawtext=fontfile=$FONT:text='Давидов Дон Сережович':fontcolor=white:fontsize=45:x=(w-text_w)/2:y=395,        drawtext=fontfile=$FONT:text='Визуальные материалы · Wikimedia Commons':fontcolor=0xBFC2C7:fontsize=25:x=(w-text_w)/2:y=555,        drawtext=fontfile=$FONT:text='Источники · Azerbaijan Travel · Jewish Languages Project':fontcolor=0xBFC2C7:fontsize=25:x=(w-text_w)/2:y=600,        drawtext=fontfile=$FONT:text='Архивные изображения в фильме помечены отдельно':fontcolor=0x8F949B:fontsize=22:x=(w-text_w)/2:y=665,        fade=t=in:st=0:d=1.2,fade=t=out:st=12.5:d=1.5"   -an -c:v libx264 -profile:v high -preset veryfast -crf 18 -pix_fmt yuv420p assets/outro.mp4

printf "file 'assets/intro.mp4'\nfile 'assets/main_visual.mp4'\nfile 'assets/outro.mp4'\n" > final_video.txt
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i final_video.txt -c copy assets/video_full.mp4

# Add 8 sec silence before narration and 14 sec after; master to stereo AAC.
ffmpeg -y -hide_banner -loglevel error   -f lavfi -t 8 -i anullsrc=r=48000:cl=stereo   -i assets/narration.m4a   -f lavfi -t 14 -i anullsrc=r=48000:cl=stereo   -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1,aresample=48000,pan=stereo|c0=c0|c1=c0[a]"   -map "[a]" -c:a aac -b:a 192k assets/audio_full.m4a

# Final iPhone-compatible 1080p master.
ffmpeg -y -hide_banner -loglevel error -i assets/video_full.mp4 -i assets/audio_full.m4a   -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy -shortest -movflags +faststart   -metadata title='Красная Слобода — Память Кавказа'   -metadata artist='Давидов Дон Сережович'   -metadata comment='Создатель проекта — Давидов Дон Сережович'   out/Krasnaya_Sloboda_Pamyat_Kavkaza_1080p.mp4

ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels   -show_entries format=duration,size -of default=nw=1 out/Krasnaya_Sloboda_Pamyat_Kavkaza_1080p.mp4
