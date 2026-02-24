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
    let firstLossGameNumber = null; // Track first loss game number
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
      } else {
        // Track first loss
        if (firstLossGameNumber === null) {
          firstLossGameNumber = game.gameNumber;
        }
        currentLoseStreak++;
        currentWinStreak = 0;
        highestLoseStreak = Math.max(highestLoseStreak, currentLoseStreak);
      }
    });

    const pts = totalWin + highestWinStreak - highestLoseStreak;

    // Get last 5 games (or all if less than 5)
    const lastFiveGames = allResults.slice(-5);

    return {
      totalWin,
      highestWinStreak,
      highestLoseStreak,
      firstLossGameNumber: firstLossGameNumber || 999, // 999 if never lost (perfect record)
      pts,
      totalGames: games.length,
      winRate: games.length > 0 ? (totalWin / games.length) * 100 : 0,
      lastFiveGames, // Array of {gameNumber, result: 'W'/'L'}
    };
  }

  // Get stats for all players in a series
  async getSeriesStats(seriesId) {
    const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
    const games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .sort({ gameNumber: 1 });

    if (games.length === 0) {
      return [];
    }

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
    // 6. First Loss Game Number (highest = loss later)
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
      
      // 6. First Loss Game Number (descending - higher is better)
      return b.firstLossGameNumber - a.firstLossGameNumber;
    });

    // Calculate zones based on remaining games
    const totalGamesInSeries = 10;
    const gamesPlayed = games.length;
    const gamesRemaining = totalGamesInSeries - gamesPlayed;

    // Calculate max possible pts for each player
    stats.forEach((stat) => {
      // Max possible: current wins + all remaining games win
      const maxWin = stat.totalWin + gamesRemaining;
      // Max WS: current WS + all remaining games (if they win all)
      const maxWS = stat.highestWinStreak + gamesRemaining;
      // LS stays the same (best case: no more losses)
      const maxLS = stat.highestLoseStreak;
      
      stat.maxPossiblePts = maxWin + maxWS - maxLS;
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
        // Series ongoing - calculate dynamic zones
        
        // Check if player is guaranteed champion (green)
        if (isFirst) {
          // Check if no one else can catch up
          const canBeCaught = stats.slice(1).some(other => other.maxPossiblePts >= stat.pts);
          if (!canBeCaught) {
            stat.zone = "champion";
          }
        }

        // Check if player is guaranteed last place (red)
        if (isLast) {
          // Check if they can't catch anyone above them
          const canCatchUp = stats.slice(0, -1).some(other => stat.maxPossiblePts >= other.pts);
          if (!canCatchUp) {
            stat.zone = "last";
          }
        }

        // Check if player is safe (yellow) - not champion yet but can't be last
        if (stat.zone === "none" && !isLast) {
          const lastPlayer = stats[stats.length - 1];
          // Safe if they can't fall to last place
          const canFallToLast = lastPlayer.maxPossiblePts >= stat.pts;
          if (!canFallToLast) {
            stat.zone = "safe";
          }
        }
      }
    });

    return stats;
  }

  // Get pts progression per game for area chart visualization
  async getSeriesPtsProgression(seriesId) {
    const seriesObjectId = new mongoose.Types.ObjectId(seriesId);
    const games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .sort({ gameNumber: 1 });

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
      .populate("seriesId", "name") // Populate series to get name
      .lean(); // Use lean for better performance

    // Sort by series name first, then by gameNumber
    // This ensures cross-series streaks are calculated correctly
    games.sort((a, b) => {
      const seriesAName = a.seriesId?.name || "";
      const seriesBName = b.seriesId?.name || "";
      
      // First sort by series name (alphabetical/numerical)
      if (seriesAName < seriesBName) return -1;
      if (seriesAName > seriesBName) return 1;
      
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
      .populate("seriesId", "name")
      .lean();

    // Sort by series name first, then by gameNumber
    games.sort((a, b) => {
      const seriesAName = a.seriesId?.name || "";
      const seriesBName = b.seriesId?.name || "";
      
      if (seriesAName < seriesBName) return -1;
      if (seriesAName > seriesBName) return 1;
      
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
}

module.exports = new StatsService();