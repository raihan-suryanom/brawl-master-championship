# MLBB Brawl Tracker - Full Stack

Complete full-stack application for tracking Mobile Legends: Bang Bang Brawl matches.

## Tech Stack

### Backend
- Node.js + Express
- MongoDB + Mongoose
- In-memory caching

### Frontend
- Astro (SSR)
- React (Islands)
- Tailwind CSS + shadcn/ui
- Recharts

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm run dev
```

Backend will run on `http://localhost:7239`

### 2. Frontend Setup

```bash
cd mlbb-tracker
npm install
npm run dev
```

Frontend will run on `http://localhost:4321`

### 3. Open Browser

Navigate to `http://localhost:4321`

## Project Structure

```
.
├── backend/                 # Express API
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic
│   └── utils/              # Cache manager
│
└── mlbb-tracker/           # Astro frontend
    ├── src/
    │   ├── components/     # React components
    │   ├── layouts/        # Astro layouts
    │   ├── pages/          # Astro pages (routes)
    │   └── lib/            # API client & utils
    └── public/
```

## Features

### Backend API
- Players CRUD
- Series management
- Game tracking
- Automated stats calculation with caching
- Player combinations analysis

### Frontend Pages
1. **Home** - All series overview
2. **Series Detail** - Leaderboard, charts, games
3. **Players** - All players
4. **Player Detail** - Individual stats & combinations
5. **Stats** - Overall stats with series filter

### Statistics Calculated
- Total Wins (W)
- Highest Win Streak (WS)
- Highest Lose Streak (LS)
- Points (Pts) = W + WS - LS
- Win Rate (%)
- Player Combinations (2-3 players)

## API Endpoints

### Players
- `GET /api/players`
- `GET /api/players/:id`
- `POST /api/players`
- `GET /api/players/:playerId/stats?seriesId=xxx`
- `GET /api/players/:playerId/combinations?size=2&seriesId=xxx`

### Series
- `GET /api/series`
- `GET /api/series/:id`
- `POST /api/series`
- `GET /api/series/:seriesId/stats`

### Games
- `GET /api/series/:seriesId/games`
- `GET /api/series/:seriesId/games/:id`
- `POST /api/series/:seriesId/games`

## Development Notes

- Backend caches all stats calculations
- Cache is invalidated automatically when new games are posted
- Frontend uses Astro SSR for fast initial page loads
- Interactive components (charts, tables) use React islands

## Production Build

### Backend
```bash
npm start
```

### Frontend
```bash
npm run build
npm run preview
```

## Contributing

This is a personal project for tracking MLBB Brawl matches with friends.
