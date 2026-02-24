# MLBB Brawl Tracker API

API untuk tracking match MLBB Brawl mode.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` jadi `.env` dan sesuaikan config:
```bash
cp .env.example .env
```

3. Edit `.env` file:
```
MONGO_URI=mongodb://localhost:27017/mlbb-brawl-tracker
PORT=3000
```

## Running

### Development mode (dengan auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

Server akan jalan di `http://localhost:3000`

## API Endpoints

### Players
- `GET /api/players` - Get all players
- `GET /api/players/:id` - Get player by ID
- `POST /api/players` - Create new player
  ```json
  {
    "name": "John",
    "picture": "https://example.com/pic.jpg",
    "color": "#FF5733"
  }
  ```

### Player Stats
- `GET /api/players/:playerId/stats` - Get overall player stats (all series)
- `GET /api/players/:playerId/stats?seriesId=xxx` - Get player stats for specific series
  - Returns: `totalWin`, `highestWinStreak`, `highestLoseStreak`, `pts`, `totalGames`, `winRate`
- `GET /api/players/:playerId/combinations?size=2` - Get 2-player combinations winrate
- `GET /api/players/:playerId/combinations?size=3` - Get 3-player combinations winrate
- `GET /api/players/:playerId/combinations?seriesId=xxx&size=2` - Filter by specific series

### Series
- `GET /api/series` - Get all series
- `GET /api/series/:id` - Get series by ID
- `POST /api/series` - Create new series
  ```json
  {
    "name": "Series #1",
    "participants": ["playerId1", "playerId2", "playerId3", "playerId4", "playerId5", "playerId6"]
  }
  ```

### Series Stats
- `GET /api/series/:seriesId/stats` - Get stats for all players in a series
  - Returns array of player stats sorted by pts (descending)
  - Each player includes: `totalWin`, `highestWinStreak`, `highestLoseStreak`, `pts`, `totalGames`, `winRate`

### Games
- `GET /api/series/:seriesId/games` - Get all games in a series
- `GET /api/series/:seriesId/games/:id` - Get specific game
- `POST /api/series/:seriesId/games` - Create new game in a series
  ```json
  {
    "gameNumber": 1,
    "teamBlue": ["playerId1", "playerId2", "playerId3"],
    "teamRed": ["playerId4", "playerId5", "playerId6"],
    "winner": "teamBlue"
  }
  ```

## Caching

The API uses in-memory caching for stats endpoints to improve performance:
- Stats are cached after first calculation
- Cache is automatically invalidated when new games are added
- No manual cache clearing needed

## Stats Calculation

**Per Series Stats (10 games):**
- `totalWin`: Total games won
- `highestWinStreak`: Longest consecutive wins
- `highestLoseStreak`: Longest consecutive losses
- `pts`: Points = totalWin + highestWinStreak - highestLoseStreak
- `winRate`: Percentage of games won

**Player Combinations:**
- Shows winrate when specific players play together
- Size 2: Player + 1 teammate
- Size 3: Player + 2 teammates
- Sorted by total games played, then by winrate

## Folder Structure
```
├── app.js
├── package.json
├── .env
├── models/
│   ├── Player.js
│   ├── Series.js
│   └── Game.js
├── routes/
│   ├── playerRoutes.js
│   ├── playerStatsRoutes.js
│   ├── seriesRoutes.js
│   ├── seriesStatsRoutes.js
│   └── gameRoutes.js
├── services/
│   └── statsService.js
└── utils/
    └── cacheManager.js
```
