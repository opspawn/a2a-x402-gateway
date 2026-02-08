#!/bin/bash
# Build the x402 demo video from captured frames
# Uses ffmpeg to create title cards, add captions, and assemble with transitions

set -e

FRAMES="/home/agent/projects/a2a-x402-gateway/demo-v2-frames"
WORK="/home/agent/projects/a2a-x402-gateway/demo-v2-work"
OUTPUT="/home/agent/projects/a2a-x402-gateway/demo-video-v2.mp4"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_MONO="/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

mkdir -p "$WORK/titled" "$WORK/sections" "$WORK/cards"

W=1920
H=1080
FPS=30

# Color scheme (matching the dark theme)
BG_COLOR="0x0a0a0a"
CYAN="0x00d4ff"
GREEN="0x4dff88"
YELLOW="0xffcc00"
WHITE="0xffffff"
GRAY="0xaaaaaa"

echo "=== Building x402 Demo Video ==="
echo ""

# -------------------------------------------------------
# STEP 1: Create section title cards (dark bg + gradient text effect)
# -------------------------------------------------------
echo "Step 1: Creating title cards..."

create_title_card() {
  local outfile="$1"
  local title="$2"
  local subtitle="$3"
  local badge="$4"
  local duration="$5"

  ffmpeg -y -f lavfi -i "color=c=0x0a0a0a:s=${W}x${H}:d=${duration}" \
    -vf "\
      drawtext=fontfile=${FONT}:text='${badge}':fontcolor=0x00d4ff:fontsize=28:x=(w-text_w)/2:y=h/2-120:alpha='if(lt(t,0.3),t/0.3,1)', \
      drawtext=fontfile=${FONT}:text='${title}':fontcolor=0xffffff:fontsize=72:x=(w-text_w)/2:y=h/2-40:alpha='if(lt(t,0.5),t/0.5,1)', \
      drawtext=fontfile=${FONT_REG}:text='${subtitle}':fontcolor=0x888888:fontsize=32:x=(w-text_w)/2:y=h/2+60:alpha='if(lt(t,0.7),t/0.7,1)'" \
    -c:v libx264 -pix_fmt yuv420p -t "$duration" "$outfile" 2>/dev/null
  echo "  Created: $(basename $outfile)"
}

# Intro card (4s)
create_title_card "$WORK/cards/00-intro.mp4" \
  "A2A x402 Gateway" \
  "Pay-per-request AI agent services via A2A + x402 V2 micropayments" \
  "OpSpawn" \
  4

# Section cards (3s each)
create_title_card "$WORK/cards/01-discovery.mp4" \
  "Agent Discovery" \
  "A2A protocol agent card with x402 payment extensions" \
  "SECTION 1" \
  3

create_title_card "$WORK/cards/02-demo.mp4" \
  "Interactive Demo" \
  "Architecture, payment flows, and SDK integration" \
  "SECTION 2" \
  3

create_title_card "$WORK/cards/03-payment.mp4" \
  "Live x402 Payments" \
  "Real micropayments on Base + SKALE Europa" \
  "SECTION 3" \
  3

create_title_card "$WORK/cards/04-dashboard.mp4" \
  "Dashboard & Stats" \
  "392+ tasks processed \\| $0.55 USDC earned \\| 3 SIWx sessions" \
  "SECTION 4" \
  3

create_title_card "$WORK/cards/05-code.mp4" \
  "Source Code" \
  "Open source on GitLab - server.mjs + full test suite" \
  "SECTION 5" \
  3

# Outro card (4s)
ffmpeg -y -f lavfi -i "color=c=0x0a0a0a:s=${W}x${H}:d=4" \
  -vf "\
    drawtext=fontfile=${FONT}:text='A2A x402 Gateway':fontcolor=0x00d4ff:fontsize=56:x=(w-text_w)/2:y=h/2-100:alpha='if(lt(t,0.5),t/0.5,1)', \
    drawtext=fontfile=${FONT_REG}:text='Built by OpSpawn — an autonomous AI agent':fontcolor=0xffffff:fontsize=32:x=(w-text_w)/2:y=h/2-20:alpha='if(lt(t,0.7),t/0.7,1)', \
    drawtext=fontfile=${FONT_MONO}:text='https\://a2a.opspawn.com':fontcolor=0x4dff88:fontsize=28:x=(w-text_w)/2:y=h/2+40:alpha='if(lt(t,0.9),t/0.9,1)', \
    drawtext=fontfile=${FONT_REG}:text='gitlab.com/opspawnhq/a2a-x402-gateway':fontcolor=0x888888:fontsize=24:x=(w-text_w)/2:y=h/2+90:alpha='if(lt(t,1.1),t/1.1,1)', \
    drawtext=fontfile=${FONT_REG}:text='SF Agentic Commerce x402 Hackathon 2026':fontcolor=0xffcc00:fontsize=22:x=(w-text_w)/2:y=h/2+150:alpha='if(lt(t,1.3),t/1.3,1)'" \
  -c:v libx264 -pix_fmt yuv420p -t 4 "$WORK/cards/99-outro.mp4" 2>/dev/null
echo "  Created: 99-outro.mp4"

# -------------------------------------------------------
# STEP 2: Add caption overlays to each screenshot frame
# -------------------------------------------------------
echo ""
echo "Step 2: Adding captions to frames..."

add_caption() {
  local infile="$1"
  local outfile="$2"
  local caption="$3"
  local url="$4"
  local duration="$5"

  local filter="drawbox=x=0:y=ih-80:w=iw:h=80:color=0x000000@0.75:t=fill"
  filter="$filter, drawtext=fontfile=${FONT_REG}:text='${caption}':fontcolor=0xffffff:fontsize=26:x=30:y=ih-58"

  if [ -n "$url" ]; then
    filter="$filter, drawtext=fontfile=${FONT_MONO}:text='${url}':fontcolor=0x00d4ff:fontsize=20:x=w-text_w-30:y=ih-54"
  fi

  # Add subtle fade in
  filter="$filter, fade=t=in:st=0:d=0.4"

  ffmpeg -y -loop 1 -i "$infile" -vf "$filter" \
    -c:v libx264 -pix_fmt yuv420p -t "$duration" -r $FPS "$outfile" 2>/dev/null
  echo "  $(basename $outfile)"
}

# Section 1: Discovery (5 frames → ~6s each = 30s total)
add_caption "$FRAMES/001-01-dashboard-landing.png" "$WORK/titled/001.mp4" \
  "Dashboard — Live agent gateway with real payment stats" \
  "a2a.opspawn.com" 6

add_caption "$FRAMES/002-01-dashboard-scrolled.png" "$WORK/titled/002.mp4" \
  "Agent skills, endpoints, and payment configuration" \
  "" 5

add_caption "$FRAMES/003-01-agent-card-json.png" "$WORK/titled/003.mp4" \
  "A2A Agent Card — Standard discovery endpoint" \
  ".well-known/agent-card.json" 6

add_caption "$FRAMES/004-01-agent-card-skills.png" "$WORK/titled/004.mp4" \
  "Skills with x402 V2 payment extensions" \
  "" 5

add_caption "$FRAMES/005-01-agent-card-x402.png" "$WORK/titled/005.mp4" \
  "Multi-chain payment config: Base + SKALE Europa (gasless)" \
  "" 5

# Section 2: Interactive Demo (7 frames → ~6-7s each ≈ 45s)
add_caption "$FRAMES/006-02-demo-hero.png" "$WORK/titled/006.mp4" \
  "Demo page — Live stats and embedded video" \
  "a2a.opspawn.com/demo" 7

add_caption "$FRAMES/007-02-demo-stats.png" "$WORK/titled/007.mp4" \
  "Real metrics: \$0.55 USDC earned, 392 tasks, 339 payments" \
  "" 6

add_caption "$FRAMES/008-02-demo-architecture.png" "$WORK/titled/008.mp4" \
  "Architecture: Agent Client → A2A Gateway → x402 Payment → Result" \
  "" 7

add_caption "$FRAMES/009-02-demo-scenarios.png" "$WORK/titled/009.mp4" \
  "Step-by-step payment scenarios with animated walkthroughs" \
  "" 6

add_caption "$FRAMES/010-02-demo-payment-flow.png" "$WORK/titled/010.mp4" \
  "x402 payment negotiation and SIWx session reuse" \
  "" 6

add_caption "$FRAMES/011-02-demo-protocol.png" "$WORK/titled/011.mp4" \
  "Protocol details: JSON-RPC messages and x402 headers" \
  "" 6

add_caption "$FRAMES/012-02-demo-sdk.png" "$WORK/titled/012.mp4" \
  "SDK code samples — JavaScript, Python integration" \
  "" 6

# Section 3: Live Payment (6 frames → ~7-8s each ≈ 45s)
add_caption "$FRAMES/013-03-x402-catalog.png" "$WORK/titled/013.mp4" \
  "x402 Service Catalog — machine-readable pricing" \
  "a2a.opspawn.com/x402" 7

add_caption "$FRAMES/014-03-payment-required-402.png" "$WORK/titled/014.mp4" \
  "HTTP 402 Payment Required — x402 V2 payment response" \
  "/x402/screenshot" 8

add_caption "$FRAMES/015-03-api-info.png" "$WORK/titled/015.mp4" \
  "API Info — Agent metadata and payment configuration" \
  "/api/info" 7

add_caption "$FRAMES/016-03-api-info-payments.png" "$WORK/titled/016.mp4" \
  "Payment networks: Base USDC + SKALE Europa (gasless)" \
  "" 7

add_caption "$FRAMES/017-03-payment-events.png" "$WORK/titled/017.mp4" \
  "Payment event log — real settled transactions" \
  "/api/payments" 8

add_caption "$FRAMES/018-03-payment-events-more.png" "$WORK/titled/018.mp4" \
  "55 settled payments across Base and SKALE networks" \
  "" 7

# Section 4: Dashboard & Stats (5 frames → ~6s each = 30s)
add_caption "$FRAMES/019-04-dashboard-live.png" "$WORK/titled/019.mp4" \
  "Live Dashboard — Auto-refreshing every 3 seconds" \
  "a2a.opspawn.com/dashboard" 6

add_caption "$FRAMES/020-04-dashboard-skills.png" "$WORK/titled/020.mp4" \
  "Three skills: Screenshot (\$0.01), PDF (\$0.005), HTML (free)" \
  "" 6

add_caption "$FRAMES/021-04-dashboard-activity.png" "$WORK/titled/021.mp4" \
  "Recent activity feed with payment types and timestamps" \
  "" 6

add_caption "$FRAMES/022-04-stats-json.png" "$WORK/titled/022.mp4" \
  "Raw stats endpoint — agent economy dashboard data" \
  "a2a.opspawn.com/stats" 6

add_caption "$FRAMES/023-04-stats-json-more.png" "$WORK/titled/023.mp4" \
  "28.2%% conversion rate, SIWx session analytics" \
  "" 6

# Section 5: Code Tour (6 frames → ~5s each = 30s)
add_caption "$FRAMES/024-05-gitlab-repo.png" "$WORK/titled/024.mp4" \
  "Open source on GitLab — 10 commits, full project" \
  "gitlab.com/opspawnhq" 5

add_caption "$FRAMES/025-05-server-code.png" "$WORK/titled/025.mp4" \
  "server.mjs — 1,390 lines of A2A + x402 implementation" \
  "" 5

add_caption "$FRAMES/026-05-server-code-scroll1.png" "$WORK/titled/026.mp4" \
  "Express routes, JSON-RPC handler, payment verification" \
  "" 5

add_caption "$FRAMES/027-05-test-code.png" "$WORK/titled/027.mp4" \
  "test.mjs — 29 comprehensive tests covering all flows" \
  "" 5

add_caption "$FRAMES/028-05-test-code-scroll.png" "$WORK/titled/028.mp4" \
  "Payment flow tests, SIWx sessions, error handling" \
  "" 5

add_caption "$FRAMES/029-05-readme.png" "$WORK/titled/029.mp4" \
  "README with live demo links and documentation" \
  "" 5

# -------------------------------------------------------
# STEP 3: Assemble final video
# -------------------------------------------------------
echo ""
echo "Step 3: Building concat list..."

# Create concat file
cat > "$WORK/concat.txt" << 'CONCAT'
file 'cards/00-intro.mp4'
file 'cards/01-discovery.mp4'
file 'titled/001.mp4'
file 'titled/002.mp4'
file 'titled/003.mp4'
file 'titled/004.mp4'
file 'titled/005.mp4'
file 'cards/02-demo.mp4'
file 'titled/006.mp4'
file 'titled/007.mp4'
file 'titled/008.mp4'
file 'titled/009.mp4'
file 'titled/010.mp4'
file 'titled/011.mp4'
file 'titled/012.mp4'
file 'cards/03-payment.mp4'
file 'titled/013.mp4'
file 'titled/014.mp4'
file 'titled/015.mp4'
file 'titled/016.mp4'
file 'titled/017.mp4'
file 'titled/018.mp4'
file 'cards/04-dashboard.mp4'
file 'titled/019.mp4'
file 'titled/020.mp4'
file 'titled/021.mp4'
file 'titled/022.mp4'
file 'titled/023.mp4'
file 'cards/05-code.mp4'
file 'titled/024.mp4'
file 'titled/025.mp4'
file 'titled/026.mp4'
file 'titled/027.mp4'
file 'titled/028.mp4'
file 'titled/029.mp4'
file 'cards/99-outro.mp4'
CONCAT

echo "Step 4: Concatenating all segments..."
ffmpeg -y -f concat -safe 0 -i "$WORK/concat.txt" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUTPUT" 2>/dev/null

echo ""
echo "=== Video build complete ==="
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" 2>/dev/null)
SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "Output: $OUTPUT"
echo "Duration: ${DURATION}s"
echo "Size: $SIZE"
echo ""

# Also copy to public directory for serving
cp "$OUTPUT" "/home/agent/projects/a2a-x402-gateway/public/demo-video-v2.mp4"
echo "Copied to public/demo-video-v2.mp4"
