import db from '../config/database.js';

export const analyticsController = {

  // ============================================================
  // MÉTRICAS GLOBALES
  // ============================================================
  getGlobalMetrics(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND tournament_id = ${tid}` : '';
      const twa = tid ? `AND id = ${tid}` : '';
      const bwa = tid ? `AND tournament_id = ${tid}` : '';

      const global = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM tournaments WHERE 1=1 ${twa})                                     AS total_tournaments,
          (SELECT COUNT(*) FROM tournaments WHERE status = 'active' ${twa})                       AS active_tournaments,
          (SELECT COUNT(*) FROM tournaments WHERE status = 'completed' ${twa})                    AS completed_tournaments,
          (SELECT COUNT(*) FROM fights WHERE 1=1 ${fwa})                                          AS total_fights,
          (SELECT COUNT(*) FROM fights WHERE status = 'completed' ${fwa})                         AS completed_fights,
          (SELECT COUNT(*) FROM fights WHERE status = 'pending' ${fwa})                           AS pending_fights,
          (SELECT COUNT(*) FROM fights WHERE status = 'cancelled' ${fwa})                         AS cancelled_fights,
          (SELECT COUNT(DISTINCT competitor_red) + COUNT(DISTINCT competitor_blue)
             FROM fights WHERE 1=1 ${fwa})                                                        AS raw_competitor_count,
          (SELECT COUNT(DISTINCT academy_red) + COUNT(DISTINCT academy_blue)
             FROM fights WHERE (academy_red IS NOT NULL OR academy_blue IS NOT NULL) ${fwa})      AS raw_academy_count,
          (SELECT COUNT(*) FROM brackets WHERE 1=1 ${bwa})                                        AS total_brackets,
          (SELECT COUNT(*) FROM bracket_matches bm
             JOIN brackets b ON b.id = bm.bracket_id
             WHERE bm.status = 'completed' ${tid ? `AND b.tournament_id = ${tid}` : ''})          AS bracket_matches_completed,
          (SELECT COUNT(*) FROM podiums WHERE 1=1 ${bwa})                                         AS total_podiums
      `).get();

      // Distinct competitors (unión de rojos y azules)
      const competitors = db.prepare(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT LOWER(TRIM(competitor_red)) AS name FROM fights WHERE 1=1 ${fwa}
          UNION
          SELECT LOWER(TRIM(competitor_blue)) FROM fights WHERE 1=1 ${fwa}
        )
      `).get();

      // Distinct academies
      const academies = db.prepare(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT LOWER(TRIM(academy_red)) AS ac FROM fights WHERE academy_red IS NOT NULL AND academy_red != '' ${fwa}
          UNION
          SELECT LOWER(TRIM(academy_blue)) FROM fights WHERE academy_blue IS NOT NULL AND academy_blue != '' ${fwa}
        )
      `).get();

      // Tipo de victoria breakdown
      const victoryTypes = db.prepare(`
        SELECT victory_type, COUNT(*) AS total
        FROM fights
        WHERE status = 'completed' AND victory_type IS NOT NULL ${fwa}
        GROUP BY victory_type
        ORDER BY total DESC
      `).all();

      // Peleas por ronda ganadas (si se usa sistema de rondas)
      const roundWins = db.prepare(`
        SELECT
          SUM(CASE WHEN round_1_winner = 'red'  THEN 1 ELSE 0 END) AS r1_red,
          SUM(CASE WHEN round_1_winner = 'blue' THEN 1 ELSE 0 END) AS r1_blue,
          SUM(CASE WHEN round_2_winner = 'red'  THEN 1 ELSE 0 END) AS r2_red,
          SUM(CASE WHEN round_2_winner = 'blue' THEN 1 ELSE 0 END) AS r2_blue,
          SUM(CASE WHEN round_3_winner = 'red'  THEN 1 ELSE 0 END) AS r3_red,
          SUM(CASE WHEN round_3_winner = 'blue' THEN 1 ELSE 0 END) AS r3_blue
        FROM fights WHERE status = 'completed' ${fwa}
      `).get();

      // Porcentaje completitud
      const completionRate = global.total_fights > 0
        ? Math.round((global.completed_fights / global.total_fights) * 100)
        : 0;

      res.json({
        ...global,
        distinct_competitors: competitors.cnt,
        distinct_academies: academies.cnt,
        completion_rate: completionRate,
        victory_types: victoryTypes,
        round_wins: roundWins
      });
    } catch (err) {
      console.error('Error en getGlobalMetrics:', err);
      res.status(500).json({ error: 'Error obteniendo métricas globales' });
    }
  },

  // ============================================================
  // RANKING DE ACADEMIAS / ESCUELAS
  // ============================================================
  getAcademyRanking(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND tournament_id = ${tid}` : '';

      const ranking = db.prepare(`
        SELECT
          academy,
          SUM(fights)   AS fights,
          SUM(wins)     AS wins,
          SUM(losses)   AS losses,
          ROUND(CAST(SUM(wins) AS REAL) / NULLIF(SUM(fights), 0) * 100, 1) AS win_rate
        FROM (
          SELECT
            TRIM(academy_red) AS academy,
            COUNT(*)          AS fights,
            SUM(CASE WHEN final_winner = 'red'  THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN final_winner = 'blue' THEN 1 ELSE 0 END) AS losses
          FROM fights
          WHERE status = 'completed'
            AND academy_red IS NOT NULL AND academy_red != ''
            ${fwa}
          GROUP BY LOWER(TRIM(academy_red))

          UNION ALL

          SELECT
            TRIM(academy_blue) AS academy,
            COUNT(*)           AS fights,
            SUM(CASE WHEN final_winner = 'blue' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN final_winner = 'red'  THEN 1 ELSE 0 END) AS losses
          FROM fights
          WHERE status = 'completed'
            AND academy_blue IS NOT NULL AND academy_blue != ''
            ${fwa}
          GROUP BY LOWER(TRIM(academy_blue))
        )
        GROUP BY LOWER(TRIM(academy))
        ORDER BY wins DESC, win_rate DESC
      `).all();

      res.json(ranking);
    } catch (err) {
      console.error('Error en getAcademyRanking:', err);
      res.status(500).json({ error: 'Error obteniendo ranking de academias' });
    }
  },

  // ============================================================
  // RANKING DE COMPETIDORES
  // ============================================================
  getCompetitorRanking(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND tournament_id = ${tid}` : '';

      const ranking = db.prepare(`
        SELECT
          competitor,
          MAX(academy) AS academy,
          SUM(fights)  AS fights,
          SUM(wins)    AS wins,
          SUM(losses)  AS losses,
          ROUND(CAST(SUM(wins) AS REAL) / NULLIF(SUM(fights), 0) * 100, 1) AS win_rate
        FROM (
          SELECT
            TRIM(competitor_red)  AS competitor,
            TRIM(academy_red)     AS academy,
            COUNT(*)              AS fights,
            SUM(CASE WHEN final_winner = 'red'  THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN final_winner = 'blue' THEN 1 ELSE 0 END) AS losses
          FROM fights
          WHERE status = 'completed' ${fwa}
          GROUP BY LOWER(TRIM(competitor_red))

          UNION ALL

          SELECT
            TRIM(competitor_blue) AS competitor,
            TRIM(academy_blue)    AS academy,
            COUNT(*)              AS fights,
            SUM(CASE WHEN final_winner = 'blue' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN final_winner = 'red'  THEN 1 ELSE 0 END) AS losses
          FROM fights
          WHERE status = 'completed' ${fwa}
          GROUP BY LOWER(TRIM(competitor_blue))
        )
        GROUP BY LOWER(TRIM(competitor))
        ORDER BY wins DESC, win_rate DESC
      `).all();

      res.json(ranking);
    } catch (err) {
      console.error('Error en getCompetitorRanking:', err);
      res.status(500).json({ error: 'Error obteniendo ranking de competidores' });
    }
  },

  // ============================================================
  // MÉTRICAS POR TORNEO
  // ============================================================
  getTournamentMetrics(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const whereClause = tid ? `WHERE t.id = ${tid}` : '';

      const metrics = db.prepare(`
        SELECT
          t.id,
          t.name,
          t.category,
          t.division,
          t.weight_class,
          t.status,
          t.created_at,
          COUNT(f.id)                                                              AS total_fights,
          SUM(CASE WHEN f.status = 'completed' THEN 1 ELSE 0 END)                 AS completed_fights,
          SUM(CASE WHEN f.status = 'pending'   THEN 1 ELSE 0 END)                 AS pending_fights,
          SUM(CASE WHEN f.status = 'cancelled' THEN 1 ELSE 0 END)                 AS cancelled_fights,
          COUNT(DISTINCT f.competitor_red)                                         AS unique_red_competitors,
          COUNT(DISTINCT f.competitor_blue)                                        AS unique_blue_competitors,
          COUNT(DISTINCT f.academy_red)                                            AS unique_red_academies,
          COUNT(DISTINCT f.academy_blue)                                           AS unique_blue_academies,
          (SELECT COUNT(*) FROM brackets b WHERE b.tournament_id = t.id)          AS num_brackets,
          ROUND(
            CAST(SUM(CASE WHEN f.status = 'completed' THEN 1 ELSE 0 END) AS REAL)
            / NULLIF(COUNT(f.id), 0) * 100, 1
          )                                                                        AS completion_rate
        FROM tournaments t
        LEFT JOIN fights f ON f.tournament_id = t.id
        ${whereClause}
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `).all();

      res.json(metrics);
    } catch (err) {
      console.error('Error en getTournamentMetrics:', err);
      res.status(500).json({ error: 'Error obteniendo métricas por torneo' });
    }
  },

  // ============================================================
  // MÉTRICAS POR LLAVE (BRACKET)
  // ============================================================
  getBracketMetrics(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const whereClause = tid ? `WHERE b.tournament_id = ${tid}` : '';

      const metrics = db.prepare(`
        SELECT
          b.id,
          b.name                                                                   AS bracket_name,
          t.id                                                                     AS tournament_id,
          t.name                                                                   AS tournament_name,
          t.category,
          t.division,
          t.weight_class,
          (SELECT COUNT(*) FROM bracket_competitors bc WHERE bc.bracket_id = b.id)   AS num_competitors,
          (SELECT COUNT(*) FROM bracket_matches bm WHERE bm.bracket_id = b.id)       AS total_matches,
          (SELECT COUNT(*) FROM bracket_matches bm WHERE bm.bracket_id = b.id AND bm.status = 'completed') AS completed_matches,
          (SELECT COUNT(DISTINCT f.id) FROM fights f WHERE f.bracket_id = b.id)     AS fights_from_bracket,
          (SELECT COUNT(DISTINCT f.id) FROM fights f WHERE f.bracket_id = b.id AND f.status = 'completed') AS completed_fights,
          (SELECT p.first_place      FROM podiums p WHERE p.tournament_id = t.id)   AS first_place,
          (SELECT p.first_place_academy FROM podiums p WHERE p.tournament_id = t.id) AS first_place_academy,
          (SELECT p.second_place     FROM podiums p WHERE p.tournament_id = t.id)   AS second_place,
          (SELECT p.third_place_1    FROM podiums p WHERE p.tournament_id = t.id)   AS third_place
        FROM brackets b
        JOIN tournaments t ON t.id = b.tournament_id
        ${whereClause}
        ORDER BY b.id DESC
      `).all();

      res.json(metrics);
    } catch (err) {
      console.error('Error en getBracketMetrics:', err);
      res.status(500).json({ error: 'Error obteniendo métricas por llave' });
    }
  },

  // ============================================================
  // DETALLE DE UN COMPETIDOR
  // ============================================================
  getCompetitorDetail(req, res) {
    try {
      const { name } = req.params;
      if (!name) return res.status(400).json({ error: 'Nombre requerido' });

      const nameLower = `%${name.toLowerCase()}%`;

      const fights = db.prepare(`
        SELECT
          f.id,
          f.fight_number,
          t.name     AS tournament_name,
          t.category,
          t.division,
          t.weight_class,
          CASE
            WHEN LOWER(TRIM(f.competitor_red)) LIKE LOWER(TRIM(?)) THEN 'red'
            ELSE 'blue'
          END AS side,
          f.competitor_red,
          f.competitor_blue,
          f.academy_red,
          f.academy_blue,
          f.final_winner,
          f.victory_type,
          f.round_1_winner,
          f.round_2_winner,
          f.round_3_winner,
          f.status,
          f.created_at
        FROM fights f
        JOIN tournaments t ON t.id = f.tournament_id
        WHERE f.status = 'completed'
          AND (LOWER(TRIM(f.competitor_red)) LIKE ? OR LOWER(TRIM(f.competitor_blue)) LIKE ?)
        ORDER BY f.created_at DESC
      `).all(name, nameLower, nameLower);

      const wins = fights.filter(f =>
        (f.side === 'red' && f.final_winner === 'red') ||
        (f.side === 'blue' && f.final_winner === 'blue')
      ).length;

      res.json({
        name,
        total_fights: fights.length,
        wins,
        losses: fights.length - wins,
        win_rate: fights.length > 0 ? Math.round((wins / fights.length) * 100) : 0,
        fights
      });
    } catch (err) {
      console.error('Error en getCompetitorDetail:', err);
      res.status(500).json({ error: 'Error obteniendo detalle del competidor' });
    }
  },

  // ============================================================
  // DETALLE DE UNA ACADEMIA
  // ============================================================
  getAcademyDetail(req, res) {
    try {
      const { name } = req.params;
      if (!name) return res.status(400).json({ error: 'Nombre requerido' });

      const nameLike = `%${name}%`;

      const fights = db.prepare(`
        SELECT
          f.id,
          f.fight_number,
          t.name  AS tournament_name,
          t.category,
          t.division,
          CASE
            WHEN LOWER(TRIM(f.academy_red)) LIKE LOWER(?) THEN 'red'
            ELSE 'blue'
          END AS side,
          f.competitor_red,
          f.competitor_blue,
          f.academy_red,
          f.academy_blue,
          f.final_winner,
          f.victory_type,
          f.status
        FROM fights f
        JOIN tournaments t ON t.id = f.tournament_id
        WHERE f.status = 'completed'
          AND (LOWER(TRIM(f.academy_red)) LIKE LOWER(?) OR LOWER(TRIM(f.academy_blue)) LIKE LOWER(?))
        ORDER BY f.created_at DESC
      `).all(nameLike, nameLike, nameLike);

      // Competidores de esta academia
      const competitors = db.prepare(`
        SELECT DISTINCT competitor, academy FROM (
          SELECT TRIM(competitor_red) AS competitor, TRIM(academy_red) AS academy
          FROM fights
          WHERE LOWER(TRIM(academy_red)) LIKE LOWER(?)
          UNION
          SELECT TRIM(competitor_blue), TRIM(academy_blue)
          FROM fights
          WHERE LOWER(TRIM(academy_blue)) LIKE LOWER(?)
        )
        ORDER BY competitor
      `).all(nameLike, nameLike);

      const wins = fights.filter(f =>
        (f.side === 'red' && f.final_winner === 'red') ||
        (f.side === 'blue' && f.final_winner === 'blue')
      ).length;

      // Podios conseguidos
      const podiums = db.prepare(`
        SELECT
          p.*,
          t.name AS tournament_name,
          t.category,
          t.division,
          t.weight_class
        FROM podiums p
        JOIN tournaments t ON t.id = p.tournament_id
        WHERE LOWER(TRIM(p.first_place_academy))  LIKE LOWER(?)
           OR LOWER(TRIM(p.second_place_academy)) LIKE LOWER(?)
           OR LOWER(TRIM(p.third_place_1_academy)) LIKE LOWER(?)
           OR LOWER(TRIM(p.third_place_2_academy)) LIKE LOWER(?)
      `).all(nameLike, nameLike, nameLike, nameLike);

      res.json({
        name,
        total_fights: fights.length,
        wins,
        losses: fights.length - wins,
        win_rate: fights.length > 0 ? Math.round((wins / fights.length) * 100) : 0,
        competitors,
        podiums,
        fights
      });
    } catch (err) {
      console.error('Error en getAcademyDetail:', err);
      res.status(500).json({ error: 'Error obteniendo detalle de academia' });
    }
  },

  // ============================================================
  // TOP N (resumen rápido para tarjetas del dashboard)
  // ============================================================
  getTopStats(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND tournament_id = ${tid}` : '';

      // Top academias
      const topAcademies = db.prepare(`
        SELECT academy, SUM(wins) AS wins, SUM(fights) AS fights,
          ROUND(CAST(SUM(wins) AS REAL) / NULLIF(SUM(fights), 0) * 100, 1) AS win_rate
        FROM (
          SELECT TRIM(academy_red) AS academy, COUNT(*) AS fights,
            SUM(CASE WHEN final_winner='red' THEN 1 ELSE 0 END) AS wins
          FROM fights WHERE status='completed' AND academy_red IS NOT NULL AND academy_red != '' ${fwa}
          GROUP BY LOWER(TRIM(academy_red))
          UNION ALL
          SELECT TRIM(academy_blue), COUNT(*),
            SUM(CASE WHEN final_winner='blue' THEN 1 ELSE 0 END)
          FROM fights WHERE status='completed' AND academy_blue IS NOT NULL AND academy_blue != '' ${fwa}
          GROUP BY LOWER(TRIM(academy_blue))
        )
        GROUP BY LOWER(TRIM(academy))
        ORDER BY wins DESC, win_rate DESC
        LIMIT ?
      `).all(limit);

      // Top competidores
      const topCompetitors = db.prepare(`
        SELECT competitor, MAX(academy) AS academy,
          SUM(wins) AS wins, SUM(fights) AS fights,
          ROUND(CAST(SUM(wins) AS REAL) / NULLIF(SUM(fights), 0) * 100, 1) AS win_rate
        FROM (
          SELECT TRIM(competitor_red) AS competitor, TRIM(academy_red) AS academy,
            COUNT(*) AS fights,
            SUM(CASE WHEN final_winner='red' THEN 1 ELSE 0 END) AS wins
          FROM fights WHERE status='completed' ${fwa}
          GROUP BY LOWER(TRIM(competitor_red))
          UNION ALL
          SELECT TRIM(competitor_blue), TRIM(academy_blue), COUNT(*),
            SUM(CASE WHEN final_winner='blue' THEN 1 ELSE 0 END)
          FROM fights WHERE status='completed' ${fwa}
          GROUP BY LOWER(TRIM(competitor_blue))
        )
        GROUP BY LOWER(TRIM(competitor))
        ORDER BY wins DESC, win_rate DESC
        LIMIT ?
      `).all(limit);

      // Torneos recientes con más actividad
      const activeTournaments = db.prepare(`
        SELECT t.id, t.name, t.category, t.status,
          COUNT(f.id)                                                      AS total_fights,
          SUM(CASE WHEN f.status='completed' THEN 1 ELSE 0 END)           AS completed_fights
        FROM tournaments t
        LEFT JOIN fights f ON f.tournament_id = t.id
        ${tid ? `WHERE t.id = ${tid}` : ''}
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(limit);

      res.json({ topAcademies, topCompetitors, activeTournaments });
    } catch (err) {
      console.error('Error en getTopStats:', err);
      res.status(500).json({ error: 'Error obteniendo top stats' });
    }
  },

  // ============================================================
  // MÉTRICAS DE SCORING (técnicas, zonas, precisión de jueces)
  // ============================================================
  getScoringMetrics(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND f.tournament_id = ${tid}` : '';

      // Totales por zona (cabeza / cuerpo / gam-jeom)
      const zoneStats = db.prepare(`
        SELECT
          SUM(CASE WHEN fs.action IN ('kick_head', 'spinning_kick_head')               THEN fs.points ELSE 0 END) AS head_points,
          SUM(CASE WHEN fs.action IN ('punch_body', 'kick_body', 'spinning_kick_body')  THEN fs.points ELSE 0 END) AS body_points,
          SUM(CASE WHEN fs.action = 'gam_jeom'                                         THEN fs.points ELSE 0 END) AS gam_jeom_points,
          SUM(CASE WHEN fs.action IN ('kick_head', 'spinning_kick_head')               THEN 1 ELSE 0 END) AS head_count,
          SUM(CASE WHEN fs.action IN ('punch_body', 'kick_body', 'spinning_kick_body')  THEN 1 ELSE 0 END) AS body_count,
          COUNT(*)        AS total_events,
          SUM(fs.points)  AS total_points
        FROM fight_scores fs
        JOIN fights f ON f.id = fs.fight_id
        WHERE 1=1 ${fwa}
      `).get();

      // Desglose por técnica
      const byAction = db.prepare(`
        SELECT
          fs.action,
          COUNT(*)       AS times_awarded,
          SUM(fs.points) AS total_points
        FROM fight_scores fs
        JOIN fights f ON f.id = fs.fight_id
        WHERE 1=1 ${fwa}
        GROUP BY fs.action
        ORDER BY total_points DESC
      `).all();

      // Puntos por ronda (rojo vs azul)
      const byRound = db.prepare(`
        SELECT
          fs.round,
          fs.team,
          SUM(fs.points) AS round_points,
          COUNT(*)       AS scoring_events
        FROM fight_scores fs
        JOIN fights f ON f.id = fs.fight_id
        WHERE 1=1 ${fwa}
        GROUP BY fs.round, fs.team
        ORDER BY fs.round, fs.team
      `).all();

      // Votos de jueces por técnica (conectados vs perdidos)
      const judgeStats = db.prepare(`
        SELECT
          ji.action,
          COUNT(*) AS total_votes,
          SUM(CASE WHEN ji.processed = 1 THEN 1 ELSE 0 END) AS connected_votes,
          SUM(CASE WHEN ji.processed = 2 THEN 1 ELSE 0 END) AS missed_votes
        FROM judge_inputs ji
        JOIN fights f ON f.id = ji.fight_id
        WHERE 1=1 ${fwa}
        GROUP BY ji.action
        ORDER BY total_votes DESC
      `).all();

      // Precisión global de jueces
      const precision = db.prepare(`
        SELECT
          COUNT(*) AS total_votes,
          SUM(CASE WHEN ji.processed = 1 THEN 1 ELSE 0 END) AS connected_votes,
          SUM(CASE WHEN ji.processed = 2 THEN 1 ELSE 0 END) AS missed_votes
        FROM judge_inputs ji
        JOIN fights f ON f.id = ji.fight_id
        WHERE 1=1 ${fwa}
      `).get();

      res.json({ zoneStats, byAction, byRound, judgeStats, precision });
    } catch (err) {
      console.error('Error en getScoringMetrics:', err);
      res.status(500).json({ error: 'Error obteniendo métricas de scoring' });
    }
  },

  // ============================================================
  // SCORING POR COMPETIDOR
  // ============================================================
  getScoringCompetitors(req, res) {
    try {
      const tid = req.query.tournament_id ? parseInt(req.query.tournament_id) : null;
      const fwa = tid ? `AND f.tournament_id = ${tid}` : '';

      // Puntos oficiales por competidor
      const scored = db.prepare(`
        SELECT
          TRIM(CASE WHEN fs.team = 'red' THEN f.competitor_red ELSE f.competitor_blue END) AS competitor,
          TRIM(CASE WHEN fs.team = 'red' THEN f.academy_red   ELSE f.academy_blue   END) AS academy,
          COUNT(DISTINCT fs.fight_id) AS fights_scored,
          SUM(fs.points)              AS total_points,
          COUNT(*)                    AS scoring_events,
          SUM(CASE WHEN fs.action IN ('kick_head', 'spinning_kick_head')               THEN fs.points ELSE 0 END) AS head_points,
          SUM(CASE WHEN fs.action IN ('punch_body', 'kick_body', 'spinning_kick_body')  THEN fs.points ELSE 0 END) AS body_points,
          SUM(CASE WHEN fs.action = 'gam_jeom'                                         THEN fs.points ELSE 0 END) AS gam_jeom_pts,
          SUM(CASE WHEN fs.action = 'punch_body'         THEN 1 ELSE 0 END) AS punch_body_n,
          SUM(CASE WHEN fs.action = 'kick_body'          THEN 1 ELSE 0 END) AS kick_body_n,
          SUM(CASE WHEN fs.action = 'kick_head'          THEN 1 ELSE 0 END) AS kick_head_n,
          SUM(CASE WHEN fs.action = 'spinning_kick_body' THEN 1 ELSE 0 END) AS spin_body_n,
          SUM(CASE WHEN fs.action = 'spinning_kick_head' THEN 1 ELSE 0 END) AS spin_head_n
        FROM fight_scores fs
        JOIN fights f ON f.id = fs.fight_id
        WHERE 1=1 ${fwa}
        GROUP BY LOWER(TRIM(CASE WHEN fs.team = 'red' THEN f.competitor_red ELSE f.competitor_blue END))
        ORDER BY total_points DESC
      `).all();

      // Votos de jueces por competidor (precisión)
      const judgeComp = db.prepare(`
        SELECT
          TRIM(CASE WHEN ji.team = 'red' THEN f.competitor_red ELSE f.competitor_blue END) AS competitor,
          COUNT(*) AS total_votes,
          SUM(CASE WHEN ji.processed = 1 THEN 1 ELSE 0 END) AS connected_votes,
          SUM(CASE WHEN ji.processed = 2 THEN 1 ELSE 0 END) AS missed_votes
        FROM judge_inputs ji
        JOIN fights f ON f.id = ji.fight_id
        WHERE 1=1 ${fwa}
        GROUP BY LOWER(TRIM(CASE WHEN ji.team = 'red' THEN f.competitor_red ELSE f.competitor_blue END))
      `).all();

      const judgeMap = new Map(judgeComp.map(j => [j.competitor?.toLowerCase().trim(), j]));

      const result = scored.map(c => {
        const j             = judgeMap.get(c.competitor?.toLowerCase().trim()) || {};
        const totalVotes     = j.total_votes     || 0;
        const connectedVotes = j.connected_votes || 0;
        const missedVotes    = j.missed_votes    || 0;
        const accuracy       = totalVotes > 0 ? Math.round((connectedVotes / totalVotes) * 100) : null;
        const countMap = { punch_body: c.punch_body_n, kick_body: c.kick_body_n, kick_head: c.kick_head_n, spinning_kick_body: c.spin_body_n, spinning_kick_head: c.spin_head_n };
        const favAction = Object.entries(countMap).reduce((best, [k, v]) => ((v || 0) > (countMap[best] || 0) ? k : best), 'kick_body');
        return { ...c, total_votes: totalVotes, connected_votes: connectedVotes, missed_votes: missedVotes, accuracy_pct: accuracy, fav_action: favAction };
      });

      res.json(result);
    } catch (err) {
      console.error('Error en getScoringCompetitors:', err);
      res.status(500).json({ error: 'Error obteniendo scoring de competidores' });
    }
  }
};
