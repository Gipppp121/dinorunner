<p align="center"><img src="docs/banner.png" alt="Dinorunner"></p>

<p align="center">
  <img src="https://img.shields.io/badge/node-18%2B-2fbf71?style=flat-square&logo=nodedotjs&logoColor=white" alt="node 18+">
  <img src="https://img.shields.io/badge/multiplayer-websockets-4f8dff?style=flat-square" alt="websockets">
  <img src="https://img.shields.io/badge/dependencies-1-f5c518?style=flat-square" alt="1 dependency">
  <img src="https://img.shields.io/badge/mobile-tap%20to%20jump-ff7a45?style=flat-square" alt="mobile">
</p>

# dinorunner

The offline dino game, but everyone who opens the link runs at the same time.

You only collide with your own cacti. Other players show up as see-through ghosts: the further someone is ahead of you, the further right they run. If they are way ahead or way behind, they turn into a tag on the edge of the screen. When someone crashes you see it, and their name gets crossed out in the list.

Best score of the day and of all time go to the leaderboard.

## Run it on your computer

Needs Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:8080, type a name, press PLAY. Open a second tab to race yourself.

People on the same Wi-Fi can join with your local IP, for example http://192.168.0.12:8080.

| setting | default | what it does |
|---|---|---|
| `PORT` | 8080 | port for the page and the server |
| `MAX_CONN` | 600 | connections on the whole server |
| `UPSTASH_REDIS_REST_URL` | none | Upstash database URL, keeps the leaderboard across restarts |
| `UPSTASH_REDIS_REST_TOKEN` | none | Upstash token for that database |
| `MAX_PER_IP` | 10 | connections from one address (phones on one carrier often share one) |

## Put it online

Any host that runs Node and supports WebSockets works. On Render:

1. Push this folder to a GitHub repo.
2. On render.com: New, Web Service, pick the repo.
3. Build command `npm install`, start command `npm start`.
4. Open the `onrender.com` link it gives you and post it.

### Keep the leaderboard

The leaderboard is saved to `data/leaderboard.json`, but free hosting wipes that file on every restart, redeploy and sleep. To keep the scores, give it a free Upstash Redis database:

1. On upstash.com create a Redis database (Free plan, region Frankfurt).
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from its REST API section.
3. Add both as environment variables on your host and redeploy.

The log then says `leaderboard: loaded N from upstash` on start. Writes are batched to one every 10 seconds at most, plus one on shutdown, so it stays well inside the free plan.


## Controls

| key | action |
|---|---|
| Space or ↑ | jump, hold for a higher jump |
| ↓ | duck, or drop faster in the air |
| Enter | run again after a crash |
| M | sound on or off |

On a phone: tap the right side of the game to jump, hold the left side to duck.

## What is in a run

Six zones, one after another. Every zone has its own sky, ground, obstacles and flyers:

| zone | from | what is in the way |
|---|---|---|
| 🌵 Desert | 0 | cacti, drones |
| 🌊 Ocean | 350 | coral, fish |
| ❄️ Tundra | 800 | ice spikes, birds |
| 🌃 Neon City | 1300 | cones, road blocks, police drones |
| 🔴 Mars | 1900 | red rocks, meteors |
| 🚀 Moon Base | 2600 | crystals, UFOs, lower gravity |

After the Moon Base it starts over from the Desert as lap 2.

- Speed keeps going up for about two and a half minutes, from x1.0 to x3.5. The jump gets snappier as you go faster, same height, less time in the air, so it stays hard but never turns into a coin flip.
- Later zones send more flyers and bigger cactus groups.
- Flyers come at three heights. Low ones you jump, middle ones you duck under, high ones you just keep running.
- The HUD shows the zone you are in, how far the next one is, your live place among everyone running, and a speed meter.
- Both lists show which zone each player reached.

## How it works

Every player runs their own world in the browser. Ten times a second the browser sends its score and the dino position. About three times a second the server sends each player only the 6 runners closest to their score, the ones they can actually see as ghosts, and the browser smooths them between updates. Once a second everyone gets the top 8 and their live place. Names go out once per player, not with every update.

That keeps traffic at roughly 0.5 KB per second per player, so 100 people running at once is about 170 MB an hour. Hidden tabs get nothing until they come back.

`public/rules.js` has the speed curve and is loaded by both sides. The server uses it to work out the highest score possible for how long you have been running, and cuts anything above that. Sending a fake score of 999999 three seconds into a run gets saved as about 40.

What keeps it up: pages and scripts are sent gzipped, the leaderboard is pushed only when the visible top 10 changes, messages over 1 KB are dropped, every connection is rate limited, names are cleaned, dead connections are closed after 15 seconds, slow clients are skipped instead of queued. `/health` returns how many are online, how many are running and the top score.

The page has `twitter:card` player tags that point at `/embed` on whatever domain serves it, so once it is on https the link can open as a playable card on X.

## Files

```
server.js          live list, leaderboard, static files
public/index.html  page, panels, overlay
public/game.js     the game
public/rules.js    speed curve, shared with the server
public/preview.png link preview image
```
