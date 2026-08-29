# HISTORICAL (2026-08-25 Void-pad + zoompan). Do not run.
# Framing lock 2026-08-28: full playfield, black bars. See src/preset-runner.mjs.
set -e
FF=/opt/node22/lib/node_modules/ffmpeg-static/ffmpeg
PAD="pad=2904:5164:0:1754:color=#0a0a12"
ENC="-c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p -r 24"

# A: approach, 4.5s, push z1.5->2.05, pan 2400->1500
$FF -y -loglevel error -ss 312.6 -i day43.mkv -t 4.5 -vf "$PAD,zoompan=z='1.5+0.55*min(on/107,1)':x='max(0,min(2400-900*min(on/107,1)-(iw/zoom)/2,iw-iw/zoom))':y='max(0,min(2582-(ih/zoom)/2,ih-ih/zoom))':d=1:fps=24:s=1080x1920" -an $ENC segA.mp4

# freeze source frame at 317.1 (full padded res)
$FF -y -loglevel error -ss 317.1 -i day43.mkv -frames:v 1 -vf "$PAD" freeze.png
# F: freeze 4.3s, continue push z2.05->2.35, pan 1500->1180
$FF -y -loglevel error -loop 1 -framerate 24 -i freeze.png -t 4.3 -vf "zoompan=z='2.05+0.30*min(on/102,1)':x='max(0,min(1500-320*min(on/102,1)-(iw/zoom)/2,iw-iw/zoom))':y='max(0,min(2582-(ih/zoom)/2,ih-ih/zoom))':d=1:fps=24:s=1080x1920" -an $ENC segF.mp4

# C: resume at 50% through the explosion, 1.7s src -> 3.4s out, z2.35->2.45, pan 1180->1050
$FF -y -loglevel error -ss 317.1 -i day43.mkv -t 1.7 -vf "setpts=2.0*PTS,$PAD,zoompan=z='2.35+0.10*min(on/81,1)':x='max(0,min(1180-130*min(on/81,1)-(iw/zoom)/2,iw-iw/zoom))':y='max(0,min(2582-(ih/zoom)/2,ih-ih/zoom))':d=1:fps=24:s=1080x1920" -an $ENC segC.mp4

# D: b&w WASTED slam, 2.0s still from the fireball frame
$FF -y -loglevel error -ss 318.5 -i day43.mkv -frames:v 1 -vf "$PAD" slam.png
$FF -y -loglevel error -loop 1 -framerate 24 -i slam.png -t 2.0 -i /home/user/sam/reports/orion-social-v2/assets-memes/wasted.png -filter_complex "[0:v]zoompan=z='2.45':x='max(0,min(1050-(iw/zoom)/2,iw-iw/zoom))':y='max(0,min(2582-(ih/zoom)/2,ih-ih/zoom))':d=1:fps=24:s=1080x1920,hue=s=0,eq=contrast=1.28:brightness=-0.05,vignette=PI/4.2[bg];[1:v]scale=880:-1[w];[bg][w]overlay=x=(W-w)/2:y='(H-h)/2-40':enable='gte(t,0.2)'" -an $ENC segD.mp4

ls -la seg*.mp4
