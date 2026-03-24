const mongoose = require("mongoose");
const Game = require("../models/Game");
const Player = require("../models/Player");

class StatsService {
  // Calculate win, highest win streak, highest lose streak for a player in given games
  calculatePlayerStats(playerId, games) {
    let totalWin = 0;
    let currentWinStreak = 0;
    let currentLoseStreak = 0;
    let highestWinStreak = 0;
    let highestLoseStreak = 0;
    let firstLossGameNumber = null; // Track first loss (old tiebreaker)
    let lastGameResult = null; // Track last game result (new tiebreaker)
    const allResults = []; // Track all game results

    games.forEach((game) => {
      // teamBlue and teamRed are populated, so we need to check _id
      const isInTeamBlue = game.teamBlue.some(
        (player) => player._id.toString() === playerId.toString()
      );
      const isInTeamRed = game.teamRed.some(
        (player) => player._id.toString() === playerId.toString()
      );

      let isWin = false;
      if (isInTeamBlue && game.winner === "teamBlue") isWin = true;
      if (isInTeamRed && game.winner === "teamRed") isWin = true;

      // Track result for last 5
      allResults.push({
        gameNumber: game.gameNumber,
        result: isWin ? 'W' : 'L'
      });

      if (isWin) {
        totalWin++;
        currentWinStreak++;
        currentLoseStreak = 0;
        highestWinStreak = Math.max(highestWinStreak, currentWinStreak);
        lastGameResult = "W"; // Update last game result
      } else {
        // Track first loss (old tiebreaker)
        if (firstLossGameNumber === null) {
          firstLossGameNumber = game.gameNumber;
        }
        currentLoseStreak++;
        currentWinStreak = 0;
        highestLoseStreak = Math.max(highestLoseStreak, currentLoseStreak);
        lastGameResult = "L"; // Update last game result
      }
    });

    const pts = totalWin + highestWinStreak - highestLoseStreak;

    // Get last 5 games (or all if less than 5)
    const lastFiveGames = allResults.slice(-5);

    return {
      totalWin,
      highestWinStreak,
      highestLoseStreak,
      firstLossGameNumber: firstLossGameNumber || 999, // Old tiebreaker (999 if never lost)
      lastGameResult: lastGameResult || "W", // New tiebreaker
      pts,
      totalGames: games.length,
      winRate: games.length > 0 ? (totalWin / games.length) * 100 : 0,
      lastFiveGames, // Array of {gameNumber, result: 'W'/'L'}
    };
  }

  // Get stats for all players in a series
  async getSeriesStats(seriesId, maxGameNumber = null) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
    let games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .sort({ gameNumber: 1 });

    // Filter by maxGameNumber if provided
    if (maxGameNumber && maxGameNumber > 0) {
      games = games.filter(g => g.gameNumber <= maxGameNumber);
    }

    if (games.length === 0) {
      return [];
    }

    // Determine which tiebreaker to use
    // First 16 series (by createdAt) use old rule (firstLossGameNumber)
    // Series 17+ use new rule (lastGameResult)
    const allSeries = await Series.find().sort({ createdAt: 1 }).lean();
    const seriesIndex = allSeries.findIndex(s => s._id.toString() === seriesId.toString());
    const useOldTiebreaker = seriesIndex < 16; // First 16 series (index 0-15)

    // Get unique players from all games
    const playerIds = new Set();
    games.forEach((game) => {
      game.teamBlue.forEach((player) => playerIds.add(player._id.toString()));
      game.teamRed.forEach((player) => playerIds.add(player._id.toString()));
    });

    // Calculate stats for each player
    const stats = [];
    for (const playerId of playerIds) {
      const playerStats = this.calculatePlayerStats(playerId, games);
      
      // Get player info from first occurrence in games
      let playerInfo = null;
      for (const game of games) {
        playerInfo = game.teamBlue.find(p => p._id.toString() === playerId) ||
                     game.teamRed.find(p => p._id.toString() === playerId);
        if (playerInfo) break;
      }

      stats.push({
        playerId,
        name: playerInfo?.name || "Unknown",
        picture: playerInfo?.picture || "",
        color: playerInfo?.color || "#000000",
        ...playerStats,
      });
    }

    // Sort by advanced tiebreaker rules:
    // 1. Pts (highest)
    // 2. Total Win (highest)
    // 3. Win Streak (highest)
    // 4. Win Rate (highest)
    // 5. Lose Streak (lowest)
    // 6. Conditional: First Loss (old) OR Last Game Result (new)
    stats.sort((a, b) => {
      // 1. Pts (descending)
      if (b.pts !== a.pts) return b.pts - a.pts;
      
      // 2. Total Win (descending)
      if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin;
      
      // 3. Win Streak (descending)
      if (b.highestWinStreak !== a.highestWinStreak) {
        return b.highestWinStreak - a.highestWinStreak;
      }
      
      // 4. Win Rate (descending)
      if (Math.abs(b.winRate - a.winRate) > 0.01) {
        return b.winRate - a.winRate;
      }
      
      // 5. Lose Streak (ascending - lower is better)
      if (a.highestLoseStreak !== b.highestLoseStreak) {
        return a.highestLoseStreak - b.highestLoseStreak;
      }
      
      // 6. Conditional tiebreaker based on series order
      if (useOldTiebreaker) {
        // Series 1-16: First Loss Game Number (higher is better)
        return b.firstLossGameNumber - a.firstLossGameNumber;
      } else {
        // Series 17+: Last Game Result (W > L)
        if (a.lastGameResult !== b.lastGameResult) {
          return a.lastGameResult === "W" ? -1 : 1;
        }
      }
      
      return 0;
    });

    // Calculate zones based on remaining games
    const totalGamesInSeries = 10;
    const gamesPlayed = games.length;
    const gamesRemaining = totalGamesInSeries - gamesPlayed;

    // Calculate max and min possible pts for each player
    stats.forEach((stat) => {
      // MAX POSSIBLE PTS (Best Case Scenario)
      // - Win all remaining games
      // - Win streak could reach gamesRemaining (if better than current)
      // - Lose streak stays same (no more losses)
      const maxTotalWin = stat.totalWin + gamesRemaining;
      const maxWinStreak = Math.max(stat.highestWinStreak, gamesRemaining);
      const minLoseStreak = stat.highestLoseStreak;
      stat.maxPossiblePts = maxTotalWin + maxWinStreak - minLoseStreak;
      
      // MIN POSSIBLE PTS (Worst Case Scenario)
      // - Lose all remaining games
      // - Win streak stays same (no improvement)
      // - Lose streak could extend by gamesRemaining
      const minTotalWin = stat.totalWin;
      const minWinStreak = stat.highestWinStreak;
      const maxLoseStreak = Math.max(stat.highestLoseStreak, gamesRemaining);
      stat.minPossiblePts = minTotalWin + minWinStreak - maxLoseStreak;
    });

    // Determine zones
    stats.forEach((stat, index) => {
      const rank = index + 1;
      const isFirst = rank === 1;
      const isLast = rank === stats.length;
      
      // Default: no zone
      stat.zone = "none";

      if (gamesRemaining === 0) {
        // Series complete - assign final zones
        if (isFirst) stat.zone = "champion";
        else if (rank >= 2 && rank <= 5) stat.zone = "safe";
        else if (isLast) stat.zone = "last";
      } else {
        // Series ongoing - calculate dynamic zones using min/max possible pts
        
        // Check if player is GUARANTEED champion (green)
        if (isFirst) {
          // Guaranteed if no one else's BEST can beat their WORST
          const guaranteed = stats.slice(1).every(
            other => other.maxPossiblePts < stat.minPossiblePts
          );
          if (guaranteed) {
            stat.zone = "champion";
          }
        }

        // Check if player is GUARANTEED last place (red)
        if (isLast) {
          // Guaranteed if their BEST can't catch anyone's WORST
          const stuck = stats.slice(0, -1).every(
            other => stat.maxPossiblePts < other.minPossiblePts
          );
          if (stuck) {
            stat.zone = "last";
          }
        }

        // Check if player is SAFE (yellow) - can't fall to last
        if (stat.zone === "none" && !isLast) {
          const lastPlayer = stats[stats.length - 1];
          // Safe if last player's BEST can't catch their WORST
          const safe = lastPlayer.maxPossiblePts < stat.minPossiblePts;
          if (safe) {
            stat.zone = "safe";
          }
        }
      }
    });

    // Calculate position changes (current game vs previous game)
    // Only skip if it's game 1 or less
    const currentMaxGame = maxGameNumber || games.length;
    if (currentMaxGame > 1) {
      // Get previous game stats (one game before current)
      const prevGames = games.filter(g => g.gameNumber <= currentMaxGame - 1);
      const prevStats = [];
      
      for (const playerId of playerIds) {
        const playerStats = this.calculatePlayerStats(playerId, prevGames);
        prevStats.push({ 
          playerId, 
          pts: playerStats.pts,
          totalWin: playerStats.totalWin,
          highestWinStreak: playerStats.highestWinStreak,
          highestLoseStreak: playerStats.highestLoseStreak,
          winRate: playerStats.winRate,
          firstLossGameNumber: playerStats.firstLossGameNumber,
          lastGameResult: playerStats.lastGameResult,
        });
      }

      // Sort previous stats by SAME tiebreaker rules as current
      prevStats.sort((a, b) => {
        // 1. Pts (descending)
        if (b.pts !== a.pts) return b.pts - a.pts;
        
        // 2. Total Win (descending)
        if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin;
        
        // 3. Win Streak (descending)
        if (b.highestWinStreak !== a.highestWinStreak) {
          return b.highestWinStreak - a.highestWinStreak;
        }
        
        // 4. Win Rate (descending)
        if (Math.abs(b.winRate - a.winRate) > 0.01) {
          return b.winRate - a.winRate;
        }
        
        // 5. Lose Streak (ascending - lower is better)
        if (a.highestLoseStreak !== b.highestLoseStreak) {
          return a.highestLoseStreak - b.highestLoseStreak;
        }
        
        // 6. Conditional tiebreaker
        if (useOldTiebreaker) {
          // Series 1-16: First Loss Game Number (higher is better)
          return b.firstLossGameNumber - a.firstLossGameNumber;
        } else {
          // Series 17+: Last Game Result (W > L)
          if (a.lastGameResult !== b.lastGameResult) {
            return a.lastGameResult === "W" ? -1 : 1;
          }
        }
        
        return 0;
      });

      // Create position map for previous game
      const prevPositions = new Map();
      prevStats.forEach((stat, index) => {
        prevPositions.set(stat.playerId, index + 1);
      });

      // Add position change to current stats
      stats.forEach((stat, currentIndex) => {
        const currentPosition = currentIndex + 1;
        const previousPosition = prevPositions.get(stat.playerId);
        
        if (previousPosition) {
          stat.positionChange = previousPosition - currentPosition; // Positive = moved up, Negative = moved down
        } else {
          stat.positionChange = 0; // New player or first game
        }
      });
    } else {
      // First game or no maxGameNumber - no position change
      stats.forEach(stat => {
        stat.positionChange = 0;
      });
    }

    return stats;
  }

  // Get pts progression per game for area chart visualization
  async getSeriesPtsProgression(seriesId, maxGameNumber = null) {
    const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
    let games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .sort({ gameNumber: 1 });

    // Filter by maxGameNumber if provided
    if (maxGameNumber && maxGameNumber > 0) {
      games = games.filter(g => g.gameNumber <= maxGameNumber);
    }

    if (games.length === 0) {
      return [];
    }

    // Get unique players
    const playerMap = new Map();
    games.forEach((game) => {
      game.teamBlue.forEach((player) => {
        if (!playerMap.has(player._id.toString())) {
          playerMap.set(player._id.toString(), {
            id: player._id.toString(),
            name: player.name,
            color: player.color,
            progression: []
          });
        }
      });
      game.teamRed.forEach((player) => {
        if (!playerMap.has(player._id.toString())) {
          playerMap.set(player._id.toString(), {
            id: player._id.toString(),
            name: player.name,
            color: player.color,
            progression: []
          });
        }
      });
    });

    // Calculate pts after each game for each player
    playerMap.forEach((playerData, playerId) => {
      let cumulativeWin = 0;
      let currentWS = 0;
      let currentLS = 0;
      let highestWS = 0;
      let highestLS = 0;

      games.forEach((game) => {
        const isInTeamBlue = game.teamBlue.some(
          (p) => p._id.toString() === playerId
        );
        const isInTeamRed = game.teamRed.some(
          (p) => p._id.toString() === playerId
        );

        // Only track if player is in this game
        if (isInTeamBlue || isInTeamRed) {
          const isWin = 
            (isInTeamBlue && game.winner === "teamBlue") ||
            (isInTeamRed && game.winner === "teamRed");

          if (isWin) {
            cumulativeWin++;
            currentWS++;
            currentLS = 0;
            highestWS = Math.max(highestWS, currentWS);
          } else {
            currentLS++;
            currentWS = 0;
            highestLS = Math.max(highestLS, currentLS);
          }

          const pts = cumulativeWin + highestWS - highestLS;

          playerData.progression.push({
            gameNumber: game.gameNumber,
            pts: pts,
            win: cumulativeWin,
            ws: highestWS,
            ls: highestLS
          });
        }
      });
    });

    return Array.from(playerMap.values());
  }

  // Get overall stats for a specific player (across all series or specific series)
  async getPlayerStats(playerId, seriesId = null) {
    const playerObjectId = new mongoose.Types.ObjectId(playerId);
    const query = { 
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    };
    
    if (seriesId) {
      query.seriesId = new mongoose.Types.ObjectId(seriesId);
    }

    // Populate seriesId to get series name for proper sorting
    const games = await Game.find(query)
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt") // Populate series to get name
      .lean(); // Use lean for better performance

    // Sort by series name first, then by gameNumber
    // This ensures cross-series streaks are calculated correctly
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      // First sort by series name (alphabetical/numerical)
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      // If same series, sort by game number
      return a.gameNumber - b.gameNumber;
    });

    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error("Player not found");
    }

    const stats = this.calculatePlayerStats(playerId, games);

    return {
      playerId,
      name: player.name,
      picture: player.picture,
      color: player.color,
      ...stats,
    };
  }

  // Get player combinations stats (2 or 3 players together)
  async getPlayerCombinations(playerId, seriesId = null, combinationSize = 2) {
    const playerObjectId = new mongoose.Types.ObjectId(playerId);
    const query = { 
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    };
    
    if (seriesId) {
      query.seriesId = new mongoose.Types.ObjectId(seriesId);
    }

    const games = await Game.find(query)
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    // Sort by series name first, then by gameNumber
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    if (games.length === 0) {
      return [];
    }

    // Track combinations and their results
    const combinationStats = new Map();

    games.forEach((game) => {
      // teamBlue and teamRed are populated, check _id
      const isInTeamBlue = game.teamBlue.some(
        (p) => p._id.toString() === playerId.toString()
      );
      const isInTeamRed = game.teamRed.some(
        (p) => p._id.toString() === playerId.toString()
      );

      const team = isInTeamBlue ? game.teamBlue : game.teamRed;
      const isWin = 
        (isInTeamBlue && game.winner === "teamBlue") ||
        (isInTeamRed && game.winner === "teamRed");

      // Get teammates (excluding the player itself)
      const teammates = team.filter(
        (p) => p._id.toString() !== playerId.toString()
      );

      // Generate combinations based on size
      if (combinationSize === 2 && teammates.length >= 1) {
        teammates.forEach((teammate) => {
          const key = [playerId.toString(), teammate._id.toString()]
            .sort()
            .join(",");
          
          if (!combinationStats.has(key)) {
            combinationStats.set(key, {
              players: [
                { 
                  id: playerId.toString(), 
                  name: null, // Will be filled later
                  picture: null,
                  color: null 
                },
                { 
                  id: teammate._id.toString(), 
                  name: teammate.name,
                  picture: teammate.picture,
                  color: teammate.color
                },
              ],
              wins: 0,
              losses: 0,
              totalGames: 0,
            });
          }

          const stat = combinationStats.get(key);
          stat.totalGames++;
          if (isWin) stat.wins++;
          else stat.losses++;
        });
      } else if (combinationSize === 3 && teammates.length >= 2) {
        // Generate all pairs of teammates (for 3-player combinations)
        for (let i = 0; i < teammates.length; i++) {
          for (let j = i + 1; j < teammates.length; j++) {
            const key = [
              playerId.toString(),
              teammates[i]._id.toString(),
              teammates[j]._id.toString(),
            ]
              .sort()
              .join(",");

            if (!combinationStats.has(key)) {
              combinationStats.set(key, {
                players: [
                  { 
                    id: playerId.toString(), 
                    name: null, // Will be filled later
                    picture: null,
                    color: null 
                  },
                  { 
                    id: teammates[i]._id.toString(), 
                    name: teammates[i].name,
                    picture: teammates[i].picture,
                    color: teammates[i].color
                  },
                  { 
                    id: teammates[j]._id.toString(), 
                    name: teammates[j].name,
                    picture: teammates[j].picture,
                    color: teammates[j].color
                  },
                ],
                wins: 0,
                losses: 0,
                totalGames: 0,
              });
            }

            const stat = combinationStats.get(key);
            stat.totalGames++;
            if (isWin) stat.wins++;
            else stat.losses++;
          }
        }
      }
    });

    // Fill in the main player's info
    const player = await Player.findById(playerId);
    combinationStats.forEach((stat) => {
      const mainPlayer = stat.players.find(p => p.id === playerId.toString());
      if (mainPlayer && player) {
        mainPlayer.name = player.name;
        mainPlayer.picture = player.picture;
        mainPlayer.color = player.color;
      }
    });

    // Convert to array and add winRate
    const results = Array.from(combinationStats.values()).map((stat) => ({
      ...stat,
      winRate: stat.totalGames > 0 ? (stat.wins / stat.totalGames) * 100 : 0,
    }));

    // Sort by totalGames desc, then by winRate desc
    results.sort((a, b) => {
      if (b.totalGames !== a.totalGames) {
        return b.totalGames - a.totalGames;
      }
      return b.winRate - a.winRate;
    });

    return results;
  }

  // Get player stats for a range of series (fromSeriesId to toSeriesId)
  async getPlayerStatsRange(playerId, fromSeriesId, toSeriesId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const playerObjectId = new mongoose.Types.ObjectId(playerId);
    const fromSeriesObjectId = new mongoose.Types.ObjectId(fromSeriesId);
    const toSeriesObjectId = new mongoose.Types.ObjectId(toSeriesId);

    // Get all series in the range (sorted by createdAt for chronological order)
    const seriesInRange = await Series.find({
      _id: {
        $gte: fromSeriesObjectId,
        $lte: toSeriesObjectId
      }
    }).sort({ createdAt: 1 });

    if (seriesInRange.length === 0) {
      return {
        playerId: playerId.toString(),
        name: "Unknown",
        picture: "",
        color: "#000000",
        totalWin: 0,
        highestWinStreak: 0,
        highestLoseStreak: 0,
        firstLossGameNumber: 999,
        lastGameResult: "W",
        pts: 0,
        totalGames: 0,
        winRate: 0,
        lastFiveGames: [],
        minPossiblePts: 0,
        maxPossiblePts: 0,
      };
    }

    const seriesIds = seriesInRange.map(s => s._id);

    // Get all games from these series where player participated
    const query = { 
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    };

    const games = await Game.find(query)
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    // Sort by series name then game number
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    const player = await Player.findById(playerId);

    if (!player) {
      throw new Error("Player not found");
    }

    if (games.length === 0) {
      return {
        playerId: playerId.toString(),
        name: player.name,
        picture: player.picture,
        color: player.color,
        totalWin: 0,
        highestWinStreak: 0,
        highestLoseStreak: 0,
        firstLossGameNumber: 999,
        lastGameResult: "W",
        pts: 0,
        totalGames: 0,
        winRate: 0,
        lastFiveGames: [],
        minPossiblePts: 0,
        maxPossiblePts: 0,
      };
    }

    const stats = this.calculatePlayerStats(playerId, games);

    return {
      playerId: playerId.toString(),
      name: player.name,
      picture: player.picture,
      color: player.color,
      ...stats,
    };
  }

  // Get player combinations for a range of series
  async getPlayerCombinationsRange(playerId, fromSeriesId, toSeriesId, combinationSize = 2) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const playerObjectId = new mongoose.Types.ObjectId(playerId);
    const fromSeriesObjectId = new mongoose.Types.ObjectId(fromSeriesId);
    const toSeriesObjectId = new mongoose.Types.ObjectId(toSeriesId);

    // Get all series in the range
    const seriesInRange = await Series.find({
      _id: {
        $gte: fromSeriesObjectId,
        $lte: toSeriesObjectId
      }
    }).sort({ createdAt: 1 });

    if (seriesInRange.length === 0) {
      return [];
    }

    const seriesIds = seriesInRange.map(s => s._id);

    // Get all games from these series where player participated
    const query = { 
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    };

    const games = await Game.find(query)
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    // Sort games
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    if (games.length === 0) {
      return [];
    }

    // Track combinations and their results
    const combinationStats = new Map();

    games.forEach((game) => {
      const isInTeamBlue = game.teamBlue.some(
        (p) => p._id.toString() === playerId.toString()
      );
      const isInTeamRed = game.teamRed.some(
        (p) => p._id.toString() === playerId.toString()
      );

      const team = isInTeamBlue ? game.teamBlue : game.teamRed;
      const isWin = 
        (isInTeamBlue && game.winner === "teamBlue") ||
        (isInTeamRed && game.winner === "teamRed");

      // Get teammates (excluding the player itself)
      const teammates = team.filter(
        (p) => p._id.toString() !== playerId.toString()
      );

      // Generate combinations
      if (combinationSize === 2) {
        // Each teammate is a duo
        teammates.forEach((teammate) => {
          const key = [playerId.toString(), teammate._id.toString()]
            .sort()
            .join("-");

          if (!combinationStats.has(key)) {
            combinationStats.set(key, {
              players: [
                { id: playerId.toString(), name: "", picture: "", color: "" },
                {
                  id: teammate._id.toString(),
                  name: teammate.name,
                  picture: teammate.picture,
                  color: teammate.color,
                },
              ],
              wins: 0,
              losses: 0,
              totalGames: 0,
            });
          }

          const stat = combinationStats.get(key);
          stat.totalGames++;
          if (isWin) stat.wins++;
          else stat.losses++;
        });
      } else if (combinationSize === 3 && teammates.length >= 2) {
        // Generate all pairs of teammates (trio = player + 2 teammates)
        for (let i = 0; i < teammates.length; i++) {
          for (let j = i + 1; j < teammates.length; j++) {
            const key = [
              playerId.toString(),
              teammates[i]._id.toString(),
              teammates[j]._id.toString(),
            ]
              .sort()
              .join("-");

            if (!combinationStats.has(key)) {
              combinationStats.set(key, {
                players: [
                  { id: playerId.toString(), name: "", picture: "", color: "" },
                  {
                    id: teammates[i]._id.toString(),
                    name: teammates[i].name,
                    picture: teammates[i].picture,
                    color: teammates[i].color,
                  },
                  {
                    id: teammates[j]._id.toString(),
                    name: teammates[j].name,
                    picture: teammates[j].picture,
                    color: teammates[j].color,
                  },
                ],
                wins: 0,
                losses: 0,
                totalGames: 0,
              });
            }

            const stat = combinationStats.get(key);
            stat.totalGames++;
            if (isWin) stat.wins++;
            else stat.losses++;
          }
        }
      }
    });

    // Fill in the main player's info
    const player = await Player.findById(playerId);
    combinationStats.forEach((stat) => {
      const mainPlayer = stat.players.find(p => p.id === playerId.toString());
      if (mainPlayer && player) {
        mainPlayer.name = player.name;
        mainPlayer.picture = player.picture;
        mainPlayer.color = player.color;
      }
    });

    // Convert to array and add winRate
    const results = Array.from(combinationStats.values()).map((stat) => ({
      ...stat,
      winRate: stat.totalGames > 0 ? (stat.wins / stat.totalGames) * 100 : 0,
    }));

    // Sort by totalGames desc, then by winRate desc
    results.sort((a, b) => {
      if (b.totalGames !== a.totalGames) {
        return b.totalGames - a.totalGames;
      }
      return b.winRate - a.winRate;
    });

    return results;
  }

  // Get player's position history across all series (OPTIMIZED with aggregation)
  async getPlayerPositionHistory(playerId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    // Get all series sorted by createdAt
    const allSeries = await Series.find().sort({ createdAt: 1 });
    
    if (allSeries.length === 0) {
      return {};
    }

    const seriesIds = allSeries.map(s => s._id);
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Fetch ALL games across all series where player participated (ONE query)
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return {};
    }

    // Group games by series
    const gamesBySeries = new Map();
    games.forEach(game => {
      const seriesId = game.seriesId._id.toString();
      if (!gamesBySeries.has(seriesId)) {
        gamesBySeries.set(seriesId, []);
      }
      gamesBySeries.get(seriesId).push(game);
    });

    // Calculate stats for each series and determine player rank
    const positionCounts = {};

    allSeries.forEach((series, seriesIndex) => {
      const seriesId = series._id.toString();
      const seriesGames = gamesBySeries.get(seriesId);
      
      if (!seriesGames) return; // Player didn't participate
      
      // Determine which tiebreaker to use (same as getSeriesStats)
      const useOldTiebreaker = seriesIndex < 16; // First 16 series

      // Sort games by game number
      seriesGames.sort((a, b) => a.gameNumber - b.gameNumber);

      // Get unique players in this series
      const playerIds = new Set();
      seriesGames.forEach(game => {
        game.teamBlue.forEach(p => playerIds.add(p._id.toString()));
        game.teamRed.forEach(p => playerIds.add(p._id.toString()));
      });

      // Calculate stats for all players in this series
      const seriesStats = [];
      for (const pid of playerIds) {
        const stats = this.calculatePlayerStats(pid, seriesGames);
        seriesStats.push({ playerId: pid, ...stats });
      }

      // Sort by tiebreaker rules (MUST match getSeriesStats!)
      seriesStats.sort((a, b) => {
        // 1. Pts (descending)
        if (b.pts !== a.pts) return b.pts - a.pts;
        
        // 2. Total Win (descending)
        if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin;
        
        // 3. Win Streak (descending)
        if (b.highestWinStreak !== a.highestWinStreak) {
          return b.highestWinStreak - a.highestWinStreak;
        }
        
        // 4. Win Rate (descending)
        if (Math.abs(b.winRate - a.winRate) > 0.01) {
          return b.winRate - a.winRate;
        }
        
        // 5. Lose Streak (ascending - lower is better)
        if (a.highestLoseStreak !== b.highestLoseStreak) {
          return a.highestLoseStreak - b.highestLoseStreak;
        }
        
        // 6. Conditional tiebreaker (SAME AS getSeriesStats!)
        if (useOldTiebreaker) {
          // Series 1-16: First Loss Game Number (higher is better)
          return b.firstLossGameNumber - a.firstLossGameNumber;
        } else {
          // Series 17+: Last Game Result (W > L)
          if (a.lastGameResult !== b.lastGameResult) {
            return a.lastGameResult === "W" ? -1 : 1;
          }
        }
        
        return 0;
      });

      // Find player's rank
      const playerRank = seriesStats.findIndex(s => s.playerId === playerId.toString()) + 1;
      
      if (playerRank > 0) {
        positionCounts[playerRank] = (positionCounts[playerRank] || 0) + 1;
      }
    });

    return positionCounts;
  }

  // Get player's position history for a range of series (OPTIMIZED)
  async getPlayerPositionHistoryRange(playerId, fromSeriesId, toSeriesId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const fromSeriesObjectId = new mongoose.Types.ObjectId(fromSeriesId);
    const toSeriesObjectId = new mongoose.Types.ObjectId(toSeriesId);

    // Get ALL series to determine indices
    const allSeries = await Series.find().sort({ createdAt: 1 });
    
    // Get series in range
    const seriesInRange = await Series.find({
      _id: {
        $gte: fromSeriesObjectId,
        $lte: toSeriesObjectId
      }
    }).sort({ createdAt: 1 });

    if (seriesInRange.length === 0) {
      return {};
    }

    const seriesIds = seriesInRange.map(s => s._id);
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Fetch ALL games across series range where player participated (ONE query)
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return {};
    }

    // Group games by series
    const gamesBySeries = new Map();
    games.forEach(game => {
      const seriesId = game.seriesId._id.toString();
      if (!gamesBySeries.has(seriesId)) {
        gamesBySeries.set(seriesId, []);
      }
      gamesBySeries.get(seriesId).push(game);
    });

    // Calculate stats for each series and determine player rank
    const positionCounts = {};

    seriesInRange.forEach((series) => {
      const seriesId = series._id.toString();
      const seriesGames = gamesBySeries.get(seriesId);
      
      if (!seriesGames) return; // Player didn't participate
      
      // Determine which tiebreaker to use (SAME AS getSeriesStats!)
      const seriesIndex = allSeries.findIndex(s => s._id.toString() === seriesId);
      const useOldTiebreaker = seriesIndex < 16; // First 16 series

      // Sort games by game number
      seriesGames.sort((a, b) => a.gameNumber - b.gameNumber);

      // Get unique players in this series
      const playerIds = new Set();
      seriesGames.forEach(game => {
        game.teamBlue.forEach(p => playerIds.add(p._id.toString()));
        game.teamRed.forEach(p => playerIds.add(p._id.toString()));
      });

      // Calculate stats for all players in this series
      const seriesStats = [];
      for (const pid of playerIds) {
        const stats = this.calculatePlayerStats(pid, seriesGames);
        seriesStats.push({ playerId: pid, ...stats });
      }

      // Sort by tiebreaker rules (MUST match getSeriesStats!)
      seriesStats.sort((a, b) => {
        // 1. Pts (descending)
        if (b.pts !== a.pts) return b.pts - a.pts;
        
        // 2. Total Win (descending)
        if (b.totalWin !== a.totalWin) return b.totalWin - a.totalWin;
        
        // 3. Win Streak (descending)
        if (b.highestWinStreak !== a.highestWinStreak) {
          return b.highestWinStreak - a.highestWinStreak;
        }
        
        // 4. Win Rate (descending)
        if (Math.abs(b.winRate - a.winRate) > 0.01) {
          return b.winRate - a.winRate;
        }
        
        // 5. Lose Streak (ascending - lower is better)
        if (a.highestLoseStreak !== b.highestLoseStreak) {
          return a.highestLoseStreak - b.highestLoseStreak;
        }
        
        // 6. Conditional tiebreaker (SAME AS getSeriesStats!)
        if (useOldTiebreaker) {
          // Series 1-16: First Loss Game Number (higher is better)
          return b.firstLossGameNumber - a.firstLossGameNumber;
        } else {
          // Series 17+: Last Game Result (W > L)
          if (a.lastGameResult !== b.lastGameResult) {
            return a.lastGameResult === "W" ? -1 : 1;
          }
        }
        
        return 0;
      });

      // Find player's rank
      const playerRank = seriesStats.findIndex(s => s.playerId === playerId.toString()) + 1;
      
      if (playerRank > 0) {
        positionCounts[playerRank] = (positionCounts[playerRank] || 0) + 1;
      }
    }); // Close forEach

    return positionCounts;
  }

  // Get player's game-by-game points progression across all series
  async getPlayerGameProgression(playerId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Get all series sorted by name
    const allSeries = await Series.find().sort({ createdAt: 1 });
    
    if (allSeries.length === 0) {
      return [];
    }

    const seriesIds = allSeries.map(s => s._id);

    // Fetch ALL games where player participated
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return [];
    }

    // Sort by series name then game number (chronological order)
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    // Calculate progression with running W, WS, LS
    const progression = [];
    let totalWins = 0;
    let currentWinStreak = 0;
    let currentLoseStreak = 0;
    let highestWinStreak = 0;
    let highestLoseStreak = 0;
    let gameIndex = 1;

    games.forEach(game => {
      const isInTeamBlue = game.teamBlue.some(p => p._id.toString() === playerId.toString());
      const isInTeamRed = game.teamRed.some(p => p._id.toString() === playerId.toString());
      
      const isWin = 
        (isInTeamBlue && game.winner === "teamBlue") ||
        (isInTeamRed && game.winner === "teamRed");

      // Update win/loss tracking
      if (isWin) {
        totalWins++;
        currentWinStreak++;
        currentLoseStreak = 0;
        
        if (currentWinStreak > highestWinStreak) {
          highestWinStreak = currentWinStreak;
        }
      } else {
        currentLoseStreak++;
        currentWinStreak = 0;
        
        if (currentLoseStreak > highestLoseStreak) {
          highestLoseStreak = currentLoseStreak;
        }
      }

      // Calculate points: W + H.WS - H.LS
      const points = totalWins + highestWinStreak - highestLoseStreak;

      progression.push({
        gameIndex,
        gameNumber: game.gameNumber,
        seriesName: game.seriesId?.name || "Unknown",
        seriesId: game.seriesId?._id.toString() || "",
        result: isWin ? "W" : "L",
        totalWins,
        highestWinStreak,
        highestLoseStreak,
        points,
      });

      gameIndex++;
    });

    return progression;
  }

  // Get player's game-by-game progression for a range of series
  async getPlayerGameProgressionRange(playerId, fromSeriesId, toSeriesId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const playerObjectId = new mongoose.Types.ObjectId(playerId);
    const fromSeriesObjectId = new mongoose.Types.ObjectId(fromSeriesId);
    const toSeriesObjectId = new mongoose.Types.ObjectId(toSeriesId);

    // Get series in range
    const seriesInRange = await Series.find({
      _id: {
        $gte: fromSeriesObjectId,
        $lte: toSeriesObjectId
      }
    }).sort({ createdAt: 1 });

    if (seriesInRange.length === 0) {
      return [];
    }

    const seriesIds = seriesInRange.map(s => s._id);

    // Fetch games from series range where player participated
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return [];
    }

    // Sort by series name then game number
    games.sort((a, b) => {
      const seriesADate = a.seriesId?.createdAt || new Date(0);
      const seriesBDate = b.seriesId?.createdAt || new Date(0);
      
      if (seriesADate < seriesBDate) return -1;
      if (seriesADate > seriesBDate) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    // Calculate progression with running W, WS, LS
    const progression = [];
    let totalWins = 0;
    let currentWinStreak = 0;
    let currentLoseStreak = 0;
    let highestWinStreak = 0;
    let highestLoseStreak = 0;
    let gameIndex = 1;

    games.forEach(game => {
      const isInTeamBlue = game.teamBlue.some(p => p._id.toString() === playerId.toString());
      const isInTeamRed = game.teamRed.some(p => p._id.toString() === playerId.toString());
      
      const isWin = 
        (isInTeamBlue && game.winner === "teamBlue") ||
        (isInTeamRed && game.winner === "teamRed");

      // Update win/loss tracking
      if (isWin) {
        totalWins++;
        currentWinStreak++;
        currentLoseStreak = 0;
        
        if (currentWinStreak > highestWinStreak) {
          highestWinStreak = currentWinStreak;
        }
      } else {
        currentLoseStreak++;
        currentWinStreak = 0;
        
        if (currentLoseStreak > highestLoseStreak) {
          highestLoseStreak = currentLoseStreak;
        }
      }

      // Calculate points: W + H.WS - H.LS
      const points = totalWins + highestWinStreak - highestLoseStreak;

      progression.push({
        gameIndex,
        gameNumber: game.gameNumber,
        seriesName: game.seriesId?.name || "Unknown",
        seriesId: game.seriesId?._id.toString() || "",
        result: isWin ? "W" : "L",
        totalWins,
        highestWinStreak,
        highestLoseStreak,
        points,
      });

      gameIndex++;
    });

    return progression;
  }

  // Get aggregate best combinations across all series (or filtered range)
  async getAggregateBestCombinations(combinationSize = 2) {
    const mongoose = require("mongoose");
    
    // Get all games
    const games = await Game.find()
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return [];
    }

    // Sort by series createdAt, then gameNumber
    games.sort((a, b) => {
      const dateA = a.seriesId?.createdAt || new Date(0);
      const dateB = b.seriesId?.createdAt || new Date(0);
      
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    return this._calculateCombinations(games, combinationSize);
  }

  async getAggregateBestCombinationsRange(combinationSize = 2, fromSeriesId, toSeriesId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const fromSeriesObjectId = new mongoose.Types.ObjectId(fromSeriesId);
    const toSeriesObjectId = new mongoose.Types.ObjectId(toSeriesId);

    // Get series in range
    const seriesInRange = await Series.find({
      _id: {
        $gte: fromSeriesObjectId,
        $lte: toSeriesObjectId
      }
    });

    if (seriesInRange.length === 0) {
      return [];
    }

    const seriesIds = seriesInRange.map(s => s._id);

    // Get games from series range
    const games = await Game.find({
      seriesId: { $in: seriesIds }
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return [];
    }

    // Sort by series createdAt, then gameNumber
    games.sort((a, b) => {
      const dateA = a.seriesId?.createdAt || new Date(0);
      const dateB = b.seriesId?.createdAt || new Date(0);
      
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      
      return a.gameNumber - b.gameNumber;
    });

    return this._calculateCombinations(games, combinationSize);
  }

  // Helper method to calculate combinations from games
  _calculateCombinations(games, combinationSize) {
    const combinationStats = new Map();

    games.forEach(game => {
      const teamBlue = game.teamBlue || [];
      const teamRed = game.teamRed || [];
      const allPlayers = [...teamBlue, ...teamRed];

      // Generate all combinations of the specified size
      const combinations = this._getCombinations(allPlayers, combinationSize);

      combinations.forEach(combo => {
        // Create a unique key for this combination (sorted player IDs)
        const key = combo.map(p => p._id.toString()).sort().join("-");

        // Check if all players in this combo are on the same team
        const allInBlue = combo.every(p => 
          teamBlue.some(tp => tp._id.toString() === p._id.toString())
        );
        const allInRed = combo.every(p => 
          teamRed.some(tp => tp._id.toString() === p._id.toString())
        );

        // Only count if they're all on the same team (they played together)
        if (allInBlue || allInRed) {
          const isWin = (allInBlue && game.winner === "teamBlue") || 
                       (allInRed && game.winner === "teamRed");

          if (!combinationStats.has(key)) {
            combinationStats.set(key, {
              players: combo.map(p => ({
                id: p._id.toString(),
                name: p.name,
                picture: p.picture,
                color: p.color,
              })),
              wins: 0,
              losses: 0,
              totalGames: 0,
            });
          }

          const stat = combinationStats.get(key);
          stat.totalGames++;
          if (isWin) stat.wins++;
          else stat.losses++;
        }
      });
    });

    // Convert to array and add winRate
    const results = Array.from(combinationStats.values()).map((stat) => ({
      ...stat,
      winRate: stat.totalGames > 0 ? (stat.wins / stat.totalGames) * 100 : 0,
    }));

    // Filter: Only combinations with >= 5 games
    const MIN_GAMES = 5;
    let filteredResults = results.filter(stat => stat.totalGames >= MIN_GAMES);

    // Edge case: If no combinations meet threshold, show top 3 with warning
    if (filteredResults.length === 0 && results.length > 0) {
      filteredResults = results
        .sort((a, b) => b.totalGames - a.totalGames)
        .slice(0, 3)
        .map(stat => ({
          ...stat,
          insufficientData: true, // Flag for frontend warning
        }));
    }

    // Calculate weighted score for qualified combinations
    const maxGames = Math.max(...filteredResults.map(r => r.totalGames), 1);
    
    const scoredResults = filteredResults.map(stat => ({
      ...stat,
      score: (stat.winRate * 0.7) + ((stat.totalGames / maxGames) * 30),
    }));

    // Sort by: score DESC, totalGames DESC (tiebreaker), wins DESC (2nd tiebreaker)
    scoredResults.sort((a, b) => {
      // Primary: Score
      if (Math.abs(b.score - a.score) > 0.01) { // Handle floating point
        return b.score - a.score;
      }
      // Tiebreaker 1: Total games
      if (b.totalGames !== a.totalGames) {
        return b.totalGames - a.totalGames;
      }
      // Tiebreaker 2: Wins
      return b.wins - a.wins;
    });

    // Return top 15
    return scoredResults.slice(0, 15);
  }

  // Helper to get all combinations of size k from array
  _getCombinations(arr, k) {
    const results = [];
    
    const combine = (start, combo) => {
      if (combo.length === k) {
        results.push([...combo]);
        return;
      }
      
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    };
    
    combine(0, []);
    return results;
  }

  // Calculate player rating based on performance
  calculatePlayerRating(avgPts, winRate, consistency) {
    // Rating tiers based on avg pts and win rate
    if (avgPts >= 12 && winRate >= 80) return { tier: 'S+', label: 'Elite', color: '#FFD700' };
    if (avgPts >= 10 && winRate >= 70) return { tier: 'S', label: 'Excellent', color: '#FF6B6B' };
    if (avgPts >= 8 && winRate >= 60) return { tier: 'A', label: 'Very Good', color: '#4ECDC4' };
    if (avgPts >= 6 && winRate >= 50) return { tier: 'B', label: 'Good', color: '#95E1D3' };
    if (avgPts >= 4 && winRate >= 40) return { tier: 'C', label: 'Average', color: '#F3A683' };
    if (avgPts >= 2 && winRate >= 30) return { tier: 'D', label: 'Below Average', color: '#F7B731' };
    if (avgPts >= 1 && winRate >= 20) return { tier: 'E', label: 'Poor', color: '#FA8231' };
    return { tier: 'F', label: 'Struggling', color: '#A29BFE' };
  }

  // Get player's performance trends across series
  async getPlayerPerformanceTrends(playerId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    // Get all series sorted by createdAt
    const allSeries = await Series.find().sort({ createdAt: 1 }).lean();
    
    if (allSeries.length === 0) {
      return {
        seriesPerformance: [],
        rating: { tier: 'F', label: 'No Data', color: '#95A5A6' },
        avgPts: 0,
        peakPts: 0,
        peakSeries: null,
        winRate: 0,
        consistency: 0,
        form: { trend: 'neutral', change: 0 },
        totalSeries: 0,
      };
    }

    const seriesIds = allSeries.map(s => s._id);
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Fetch ALL games where player participated
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name")
      .populate("teamRed", "name")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return {
        seriesPerformance: [],
        rating: { tier: 'F', label: 'No Data', color: '#95A5A6' },
        avgPts: 0,
        peakPts: 0,
        peakSeries: null,
        winRate: 0,
        consistency: 0,
        form: { trend: 'neutral', change: 0 },
        totalSeries: 0,
      };
    }

    // Group games by series
    const gamesBySeries = new Map();
    games.forEach(game => {
      const seriesId = game.seriesId._id.toString();
      if (!gamesBySeries.has(seriesId)) {
        gamesBySeries.set(seriesId, {
          games: [],
          seriesName: game.seriesId.name,
          seriesDate: game.seriesId.createdAt,
        });
      }
      gamesBySeries.get(seriesId).games.push(game);
    });

    // Calculate stats per series
    const seriesPerformance = [];
    const ptsList = [];
    let totalWins = 0;
    let totalGames = 0;

    allSeries.forEach(series => {
      const seriesId = series._id.toString();
      const seriesData = gamesBySeries.get(seriesId);
      
      if (!seriesData) return; // Player didn't participate

      const seriesGames = seriesData.games.sort((a, b) => a.gameNumber - b.gameNumber);
      const stats = this.calculatePlayerStats(playerId.toString(), seriesGames);

      seriesPerformance.push({
        seriesId,
        seriesName: seriesData.seriesName,
        seriesDate: seriesData.seriesDate,
        pts: stats.pts,
        wins: stats.totalWin,
        losses: stats.totalGames - stats.totalWin,
        winRate: stats.winRate,
        winStreak: stats.highestWinStreak,
        loseStreak: stats.highestLoseStreak,
      });

      ptsList.push(stats.pts);
      totalWins += stats.totalWin;
      totalGames += stats.totalGames;
    });

    // Calculate overall metrics
    const avgPts = ptsList.length > 0 ? ptsList.reduce((a, b) => a + b, 0) / ptsList.length : 0;
    const peakPts = ptsList.length > 0 ? Math.max(...ptsList) : 0;
    const peakSeriesIndex = ptsList.indexOf(peakPts);
    const peakSeries = peakSeriesIndex >= 0 ? seriesPerformance[peakSeriesIndex].seriesName : null;
    const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

    // Calculate consistency (standard deviation)
    const variance = ptsList.length > 0 
      ? ptsList.reduce((sum, pts) => sum + Math.pow(pts - avgPts, 2), 0) / ptsList.length 
      : 0;
    const consistency = Math.sqrt(variance);

    // Calculate form (last 3 series vs overall)
    let form = { trend: 'neutral', change: 0 };
    if (seriesPerformance.length >= 3) {
      const lastThree = seriesPerformance.slice(-3);
      const lastThreeAvg = lastThree.reduce((sum, s) => sum + s.pts, 0) / 3;
      const change = ((lastThreeAvg - avgPts) / avgPts) * 100;
      
      if (change > 10) form = { trend: 'improving', change: Math.round(change) };
      else if (change < -10) form = { trend: 'declining', change: Math.round(change) };
      else form = { trend: 'stable', change: Math.round(change) };
    }

    // Calculate rating
    const rating = this.calculatePlayerRating(avgPts, winRate, consistency);

    return {
      seriesPerformance,
      rating,
      avgPts: Math.round(avgPts * 10) / 10,
      peakPts,
      peakSeries,
      winRate: Math.round(winRate * 10) / 10,
      consistency: Math.round(consistency * 10) / 10,
      form,
      totalSeries: seriesPerformance.length,
    };
  }

  // Get clutch performance stats (close games)
  async getPlayerClutchStats(playerId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    // Get all series
    const allSeries = await Series.find().sort({ createdAt: 1 }).lean();
    
    if (allSeries.length === 0) {
      return {
        closeGameWinRate: 0,
        closeGamesPlayed: 0,
        closeGamesWon: 0,
        clutchRating: 'N/A',
      };
    }

    const seriesIds = allSeries.map(s => s._id);
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Fetch ALL games where player participated
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name")
      .populate("teamRed", "name")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return {
        closeGameWinRate: 0,
        closeGamesPlayed: 0,
        closeGamesWon: 0,
        clutchRating: 'N/A',
      };
    }

    // Group by series and calculate close games
    const gamesBySeries = new Map();
    games.forEach(game => {
      const seriesId = game.seriesId._id.toString();
      if (!gamesBySeries.has(seriesId)) {
        gamesBySeries.set(seriesId, []);
      }
      gamesBySeries.get(seriesId).push(game);
    });

    let closeGamesPlayed = 0;
    let closeGamesWon = 0;

    // For each series, check final standings
    for (const [seriesId, seriesGames] of gamesBySeries) {
      seriesGames.sort((a, b) => a.gameNumber - b.gameNumber);

      // Get all players in series
      const playerIds = new Set();
      seriesGames.forEach(game => {
        game.teamBlue.forEach(p => playerIds.add(p._id.toString()));
        game.teamRed.forEach(p => playerIds.add(p._id.toString()));
      });

      // Calculate final stats for all players
      const finalStats = [];
      for (const pid of playerIds) {
        const stats = this.calculatePlayerStats(pid, seriesGames);
        finalStats.push({ playerId: pid, pts: stats.pts });
      }

      // Sort by pts
      finalStats.sort((a, b) => b.pts - a.pts);

      // Find player's rank and pts
      const playerIndex = finalStats.findIndex(s => s.playerId === playerId.toString());
      if (playerIndex === -1) continue;

      const playerPts = finalStats[playerIndex].pts;

      // Check if close game (within 2 pts of someone above or below)
      let isCloseGame = false;

      // Check player above (if exists)
      if (playerIndex > 0) {
        const ptsAbove = finalStats[playerIndex - 1].pts;
        if (Math.abs(playerPts - ptsAbove) <= 2) {
          isCloseGame = true;
        }
      }

      // Check player below (if exists)
      if (playerIndex < finalStats.length - 1) {
        const ptsBelow = finalStats[playerIndex + 1].pts;
        if (Math.abs(playerPts - ptsBelow) <= 2) {
          isCloseGame = true;
        }
      }

      if (isCloseGame) {
        closeGamesPlayed++;
        // If player is in top half when close, consider it a "win"
        if (playerIndex < finalStats.length / 2) {
          closeGamesWon++;
        }
      }
    }

    const closeGameWinRate = closeGamesPlayed > 0 
      ? (closeGamesWon / closeGamesPlayed) * 100 
      : 0;

    // Clutch rating
    let clutchRating = 'N/A';
    if (closeGamesPlayed >= 3) {
      if (closeGameWinRate >= 70) clutchRating = 'Elite Clutch';
      else if (closeGameWinRate >= 60) clutchRating = 'Clutch';
      else if (closeGameWinRate >= 50) clutchRating = 'Reliable';
      else if (closeGameWinRate >= 40) clutchRating = 'Average';
      else clutchRating = 'Choker';
    }

    return {
      closeGameWinRate: Math.round(closeGameWinRate * 10) / 10,
      closeGamesPlayed,
      closeGamesWon,
      clutchRating,
    };
  }

  // Calculate series difficulty rating
  async calculateSeriesDifficulty(seriesId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");
    
    const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
    const series = await Series.findById(seriesObjectId).lean();
    
    if (!series) {
      return {
        difficultyScore: 0,
        difficultyTier: 'Unknown',
        difficultyEmoji: '❓',
        difficultyColor: '#95A5A6',
        factors: {},
      };
    }

    // Get all games in series
    const games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name")
      .populate("teamRed", "name")
      .sort({ gameNumber: 1 })
      .lean();

    if (games.length === 0) {
      return {
        difficultyScore: 0,
        difficultyTier: 'No Data',
        difficultyEmoji: '❓',
        difficultyColor: '#95A5A6',
        factors: {},
      };
    }

    // Get final standings
    const playerIds = new Set();
    games.forEach(game => {
      game.teamBlue.forEach(p => playerIds.add(p._id.toString()));
      game.teamRed.forEach(p => playerIds.add(p._id.toString()));
    });

    const finalStats = [];
    for (const playerId of playerIds) {
      const stats = this.calculatePlayerStats(playerId, games);
      finalStats.push({ playerId, pts: stats.pts });
    }
    finalStats.sort((a, b) => b.pts - a.pts);

    // FACTOR 1: Competitiveness Index (0-10 points)
    // Combination of pts spread AND how many players are bunched together
    const firstPts = finalStats[0]?.pts || 0;
    const lastPts = finalStats[finalStats.length - 1]?.pts || 0;
    const ptsSpread = firstPts - lastPts;
    
    // Also check how tight the middle pack is
    const midPackSpread = finalStats.length >= 3 
      ? finalStats[1].pts - finalStats[finalStats.length - 2].pts 
      : ptsSpread;
    
    // Score: Smaller spread = more competitive
    // Use average of full spread and mid pack spread for better measure
    const avgSpread = (ptsSpread + midPackSpread) / 2;
    const competitivenessScore = Math.max(0, Math.min(10, 10 - avgSpread));

    // FACTOR 2: Close Finishes (0-10 points)
    // Count how many players are within 2 pts of each other
    let closePairs = 0;
    for (let i = 0; i < finalStats.length - 1; i++) {
      if (Math.abs(finalStats[i].pts - finalStats[i + 1].pts) <= 2) {
        closePairs++;
      }
    }
    // Score: More close pairs = harder
    const closeFinishScore = Math.min(10, (closePairs / Math.max(1, finalStats.length - 1)) * 10);

    // FACTOR 3: Pts Variance (0-10 points)
    // Higher variance = more unpredictable = harder
    const avgPts = finalStats.reduce((sum, s) => sum + s.pts, 0) / finalStats.length;
    const variance = finalStats.reduce((sum, s) => sum + Math.pow(s.pts - avgPts, 2), 0) / finalStats.length;
    const stdDev = Math.sqrt(variance);
    
    // Score: Higher std dev = harder (more variation)
    const varianceScore = Math.min(10, stdDev * 2);

    // FACTOR 4: Position Changes (0-10 points)
    // Track position changes game by game
    const positionsByGame = [];
    for (let gameNum = 1; gameNum <= games.length; gameNum++) {
      const gamesUpToNow = games.filter(g => g.gameNumber <= gameNum);
      const statsAtGame = [];
      
      for (const playerId of playerIds) {
        const stats = this.calculatePlayerStats(playerId, gamesUpToNow);
        statsAtGame.push({ playerId, pts: stats.pts });
      }
      statsAtGame.sort((a, b) => b.pts - a.pts);
      
      const positions = {};
      statsAtGame.forEach((s, idx) => {
        positions[s.playerId] = idx + 1;
      });
      positionsByGame.push(positions);
    }

    // Count total position changes
    let totalChanges = 0;
    for (let i = 1; i < positionsByGame.length; i++) {
      const prevPositions = positionsByGame[i - 1];
      const currPositions = positionsByGame[i];
      
      for (const playerId of playerIds) {
        if (prevPositions[playerId] !== currPositions[playerId]) {
          totalChanges++;
        }
      }
    }

    // Score: More changes = more competitive
    const maxPossibleChanges = (games.length - 1) * playerIds.size;
    const volatilityScore = Math.min(10, (totalChanges / Math.max(1, maxPossibleChanges)) * 20);

    // CALCULATE TOTAL DIFFICULTY SCORE (weighted average)
    const weights = {
      competitiveness: 0.35, // 35% - most important
      closeFinish: 0.25,     // 25%
      variance: 0.20,        // 20%
      volatility: 0.20,      // 20%
    };

    const totalScore = 
      competitivenessScore * weights.competitiveness +
      closeFinishScore * weights.closeFinish +
      varianceScore * weights.variance +
      volatilityScore * weights.volatility;

    // Determine tier
    let tier, emoji, color;
    if (totalScore >= 8.5) {
      tier = 'Insane';
      emoji = '🔥';
      color = '#FF0000';
    } else if (totalScore >= 7) {
      tier = 'Brutal';
      emoji = '💀';
      color = '#FF4500';
    } else if (totalScore >= 5) {
      tier = 'Tough';
      emoji = '⚔️';
      color = '#FFA500';
    } else if (totalScore >= 3) {
      tier = 'Average';
      emoji = '😐';
      color = '#FFD700';
    } else {
      tier = 'Easy';
      emoji = '😴';
      color = '#90EE90';
    }

    return {
      difficultyScore: Math.round(totalScore * 10) / 10,
      difficultyTier: tier,
      difficultyEmoji: emoji,
      difficultyColor: color,
      seriesName: series.name,
      factors: {
        competitiveness: {
          value: Math.round(avgSpread * 10) / 10,
          score: Math.round(competitivenessScore * 10) / 10,
          description: `${ptsSpread} pts gap, ${Math.round(avgSpread * 10) / 10} avg spread`,
        },
        closeFinishes: {
          value: closePairs,
          score: Math.round(closeFinishScore * 10) / 10,
          description: `${closePairs} close finishes (±2 pts)`,
        },
        ptsVariance: {
          value: Math.round(stdDev * 10) / 10,
          score: Math.round(varianceScore * 10) / 10,
          description: `σ = ${Math.round(stdDev * 10) / 10} pts`,
        },
        positionChanges: {
          value: totalChanges,
          score: Math.round(volatilityScore * 10) / 10,
          description: `${totalChanges} rank changes`,
        },
      },
    };
  }

  // Get difficulty ratings for all series
  async getAllSeriesDifficulty() {
    const Series = require("../models/Series");
    
    const allSeries = await Series.find().sort({ createdAt: 1 }).lean();
    
    const difficulties = [];
    for (const series of allSeries) {
      const difficulty = await this.calculateSeriesDifficulty(series._id.toString());
      difficulties.push({
        seriesId: series._id.toString(),
        ...difficulty,
      });
    }

    // Sort by difficulty score (hardest first)
    difficulties.sort((a, b) => b.difficultyScore - a.difficultyScore);

    return difficulties;
  }

  // ===== REUSABLE HELPER FUNCTIONS =====
  
  /**
   * Get position at specific game number for a player in a series
   * @param {string} playerId - Player ID
   * @param {Array} games - All games in series
   * @param {number} gameNumber - Game number to check position at
   * @returns {number} Position (1 = first, higher = worse)
   */
  getPlayerPositionAtGame(playerId, games, gameNumber) {
    const gamesUpToNow = games.filter(g => g.gameNumber <= gameNumber);
    if (gamesUpToNow.length === 0) return 0;

    // Get all players
    const playerIds = new Set();
    gamesUpToNow.forEach(game => {
      game.teamBlue.forEach(p => playerIds.add(p._id?.toString() || p.toString()));
      game.teamRed.forEach(p => playerIds.add(p._id?.toString() || p.toString()));
    });

    // Calculate standings at this point
    const standings = [];
    for (const pid of playerIds) {
      const stats = this.calculatePlayerStats(pid, gamesUpToNow);
      standings.push({ playerId: pid, pts: stats.pts });
    }

    // Sort by pts (descending)
    standings.sort((a, b) => b.pts - a.pts);

    // Find player position
    const position = standings.findIndex(s => s.playerId === playerId.toString()) + 1;
    return position;
  }

  /**
   * Calculate position changes for a player across a series
   * @param {string} playerId - Player ID
   * @param {Array} games - All games in series (sorted by gameNumber)
   * @returns {Array} Array of {gameNumber, position, change}
   */
  getPositionProgression(playerId, games) {
    if (games.length === 0) return [];

    const progression = [];
    let previousPosition = null;

    for (let i = 1; i <= games.length; i++) {
      const position = this.getPlayerPositionAtGame(playerId, games, i);
      const change = previousPosition !== null ? position - previousPosition : 0;
      
      progression.push({
        gameNumber: i,
        position,
        change, // Negative = improved, Positive = worsened
      });

      previousPosition = position;
    }

    return progression;
  }

  /**
   * Detect comeback scenarios (won from behind)
   * @param {Array} progression - Position progression array
   * @param {number} totalPlayers - Total players in series
   * @returns {Object} Comeback stats
   */
  detectComebacks(progression, totalPlayers) {
    if (progression.length === 0) return { hadComeback: false, comebackStrength: 0 };

    const midPoint = Math.floor(progression.length / 2);
    const earlyPosition = progression[midPoint]?.position || 0;
    const finalPosition = progression[progression.length - 1]?.position || 0;

    // Comeback = started in bottom half, finished in top half
    const bottomHalfThreshold = Math.ceil(totalPlayers / 2);
    const topHalfThreshold = Math.ceil(totalPlayers / 2);

    const startedBehind = earlyPosition > bottomHalfThreshold;
    const finishedAhead = finalPosition <= topHalfThreshold;

    if (startedBehind && finishedAhead) {
      const comebackStrength = earlyPosition - finalPosition; // Bigger = stronger comeback
      return { hadComeback: true, comebackStrength };
    }

    return { hadComeback: false, comebackStrength: 0 };
  }

  /**
   * Detect throw scenarios (lost from ahead)
   * @param {Array} progression - Position progression array
   * @param {number} totalPlayers - Total players in series
   * @returns {Object} Throw stats
   */
  detectThrows(progression, totalPlayers) {
    if (progression.length === 0) return { hadThrow: false, throwSeverity: 0 };

    const midPoint = Math.floor(progression.length / 2);
    const earlyPosition = progression[midPoint]?.position || 0;
    const finalPosition = progression[progression.length - 1]?.position || 0;

    // Throw = started in top half, finished in bottom half
    const topHalfThreshold = Math.ceil(totalPlayers / 2);
    const bottomHalfThreshold = Math.ceil(totalPlayers / 2);

    const startedAhead = earlyPosition <= topHalfThreshold;
    const finishedBehind = finalPosition > bottomHalfThreshold;

    if (startedAhead && finishedBehind) {
      const throwSeverity = finalPosition - earlyPosition; // Bigger = worse throw
      return { hadThrow: true, throwSeverity };
    }

    return { hadThrow: false, throwSeverity: 0 };
  }

  // ===== PLAYER COMEBACK ANALYSIS =====

  /**
   * Get comprehensive comeback analysis for a player
   */
  async getPlayerComebackAnalysis(playerId) {
    const mongoose = require("mongoose");
    const Series = require("../models/Series");

    // Get all series
    const allSeries = await Series.find().sort({ createdAt: 1 }).lean();
    
    if (allSeries.length === 0) {
      return {
        totalSeries: 0,
        comebacks: 0,
        throws: 0,
        comebackRate: 0,
        throwRate: 0,
        avgComebackStrength: 0,
        avgThrowSeverity: 0,
        mentalToughness: 'N/A',
        momentumShifts: 0,
        seriesBreakdown: [],
      };
    }

    const seriesIds = allSeries.map(s => s._id);
    const playerObjectId = new mongoose.Types.ObjectId(playerId);

    // Fetch all games where player participated
    const games = await Game.find({
      seriesId: { $in: seriesIds },
      $or: [
        { teamBlue: playerObjectId },
        { teamRed: playerObjectId }
      ]
    })
      .populate("teamBlue", "name")
      .populate("teamRed", "name")
      .populate("seriesId", "name createdAt")
      .lean();

    if (games.length === 0) {
      return {
        totalSeries: 0,
        comebacks: 0,
        throws: 0,
        comebackRate: 0,
        throwRate: 0,
        avgComebackStrength: 0,
        avgThrowSeverity: 0,
        mentalToughness: 'N/A',
        momentumShifts: 0,
        seriesBreakdown: [],
      };
    }

    // Group by series
    const gamesBySeries = new Map();
    games.forEach(game => {
      const seriesId = game.seriesId._id.toString();
      if (!gamesBySeries.has(seriesId)) {
        gamesBySeries.set(seriesId, {
          games: [],
          seriesName: game.seriesId.name,
        });
      }
      gamesBySeries.get(seriesId).games.push(game);
    });

    let totalComebacks = 0;
    let totalThrows = 0;
    let comebackStrengths = [];
    let throwSeverities = [];
    let totalMomentumShifts = 0;
    const seriesBreakdown = [];

    // Analyze each series
    for (const [seriesId, seriesData] of gamesBySeries) {
      const seriesGames = seriesData.games.sort((a, b) => a.gameNumber - b.gameNumber);

      // Get total players in series
      const allPlayerIds = new Set();
      seriesGames.forEach(game => {
        game.teamBlue.forEach(p => allPlayerIds.add(p._id.toString()));
        game.teamRed.forEach(p => allPlayerIds.add(p._id.toString()));
      });
      const totalPlayers = allPlayerIds.size;

      // Get position progression
      const progression = this.getPositionProgression(playerId, seriesGames);

      // Detect comebacks
      const comeback = this.detectComebacks(progression, totalPlayers);
      if (comeback.hadComeback) {
        totalComebacks++;
        comebackStrengths.push(comeback.comebackStrength);
      }

      // Detect throws
      const throwData = this.detectThrows(progression, totalPlayers);
      if (throwData.hadThrow) {
        totalThrows++;
        throwSeverities.push(throwData.throwSeverity);
      }

      // Count momentum shifts (position changes)
      const shifts = progression.filter(p => p.change !== 0).length;
      totalMomentumShifts += shifts;

      // Store breakdown
      seriesBreakdown.push({
        seriesId,
        seriesName: seriesData.seriesName,
        hadComeback: comeback.hadComeback,
        comebackStrength: comeback.comebackStrength,
        hadThrow: throwData.hadThrow,
        throwSeverity: throwData.throwSeverity,
        momentumShifts: shifts,
        progression,
      });
    }

    const totalSeries = gamesBySeries.size;
    const comebackRate = totalSeries > 0 ? (totalComebacks / totalSeries) * 100 : 0;
    const throwRate = totalSeries > 0 ? (totalThrows / totalSeries) * 100 : 0;
    const avgComebackStrength = comebackStrengths.length > 0 
      ? comebackStrengths.reduce((a, b) => a + b, 0) / comebackStrengths.length 
      : 0;
    const avgThrowSeverity = throwSeverities.length > 0
      ? throwSeverities.reduce((a, b) => a + b, 0) / throwSeverities.length
      : 0;

    // Mental toughness rating
    let mentalToughness = 'N/A';
    if (totalSeries >= 3) {
      const toughnessScore = comebackRate - throwRate;
      if (toughnessScore >= 30) mentalToughness = 'Elite';
      else if (toughnessScore >= 15) mentalToughness = 'Strong';
      else if (toughnessScore >= 0) mentalToughness = 'Solid';
      else if (toughnessScore >= -15) mentalToughness = 'Shaky';
      else mentalToughness = 'Fragile';
    }

    return {
      totalSeries,
      comebacks: totalComebacks,
      throws: totalThrows,
      comebackRate: Math.round(comebackRate * 10) / 10,
      throwRate: Math.round(throwRate * 10) / 10,
      avgComebackStrength: Math.round(avgComebackStrength * 10) / 10,
      avgThrowSeverity: Math.round(avgThrowSeverity * 10) / 10,
      mentalToughness,
      momentumShifts: totalMomentumShifts,
      seriesBreakdown,
    };
  }
}

module.exports = new StatsService();