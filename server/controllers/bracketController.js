import { Bracket } from '../models/Bracket.js';
import { FightService } from '../services/fightService.js';
import db from '../config/database.js';

export const bracketController = {
  // Crear nueva llave en torneo
  create(req, res) {
    try {
      const bracket = Bracket.create(req.body);
      res.json({ success: true, bracket });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener llaves de un torneo
  getByTournament(req, res) {
    try {
      const { tournament_id } = req.params;
      const brackets = Bracket.findByTournament(tournament_id);
      res.json(brackets);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Agregar competidor a la llave
  addCompetitor(req, res) {
    try {
      const { bracket_id, name, academy, peto_color, seed } = req.body;
      const id = Bracket.addCompetitor(bracket_id, name, academy, peto_color, seed);
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener competidores de la llave
  getCompetitors(req, res) {
    try {
      const { bracket_id } = req.params;
      const competitors = Bracket.getCompetitors(bracket_id);
      res.json(competitors);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Generar estructura del bracket
  generateStructure(req, res) {
    try {
      const { bracket_id } = req.params;
      const bracketIdInt = parseInt(bracket_id);
      const matches = Bracket.generateBracketStructure(bracketIdInt);
      
      // Obtener el tournament_id del bracket
      const bracket = db.prepare('SELECT tournament_id FROM brackets WHERE id = ?').get(bracketIdInt);
      
      console.log('Matches generados:', matches.length);
      console.log('Primera ronda matches:', matches.filter(m => m.round === 1));
      
      // Crear peleas para los matches de la primera ronda que tengan ambos competidores
      if (bracket && matches.length > 0) {
        const firstRoundMatches = matches.filter(m => m.round === 1 && m.competitor1_id && m.competitor2_id);
        
        console.log('First round matches con competidores:', firstRoundMatches.length);
        
        for (const match of firstRoundMatches) {
          console.log(`Creando pelea: ${match.competitor1_name} vs ${match.competitor2_name}`);
          
          // Verificar si ya existe una pelea para este match
          const existingFight = db.prepare(`
            SELECT * FROM fights WHERE bracket_id = ? 
            AND ((competitor_red = ? AND competitor_blue = ?) OR (competitor_red = ? AND competitor_blue = ?))
          `).get(
            bracketIdInt, 
            match.competitor1_name, match.competitor2_name,
            match.competitor2_name, match.competitor1_name
          );
          
          if (!existingFight) {
            const newFight = FightService.createFight({
              tournament_id: bracket.tournament_id,
              bracket_id: bracketIdInt,
              competitor_red: match.competitor1_name,
              competitor_blue: match.competitor2_name,
              academy_red: match.competitor1_academy || '',
              academy_blue: match.competitor2_academy || '',
              category: 'Bracket'
            });
            console.log('Pelea creada:', newFight.id);
          } else {
            console.log('Pelea ya existe:', existingFight.id);
          }
        }
      }
      
      res.json({ success: true, matches });
    } catch (error) {
      console.error('Error en generateStructure:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener matches de un bracket
  getMatches(req, res) {
    try {
      const { bracket_id } = req.params;
      const matches = Bracket.getMatches(bracket_id);
      res.json(matches);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Registrar ganador de un match
  setMatchWinner(req, res) {
    try {
      const { match_id } = req.params;
      const { winner_id } = req.body;

      // Obtener match ANTES de resolverlo para conocer competidores y bracket
      const matchBefore = db.prepare(`
        SELECT m.*, b.tournament_id,
               c1.name AS competitor1_name, c2.name AS competitor2_name
        FROM bracket_matches m
        JOIN brackets b ON b.id = m.bracket_id
        LEFT JOIN bracket_competitors c1 ON c1.id = m.competitor1_id
        LEFT JOIN bracket_competitors c2 ON c2.id = m.competitor2_id
        WHERE m.id = ?
      `).get(parseInt(match_id));

      const result = Bracket.setMatchWinner(parseInt(match_id), winner_id);

      // ── Sincronizar con la tabla fights ──────────────────────────────────
      // Buscar la pelea que corresponde a este bracket_match (por nombres y bracket_id)
      if (matchBefore) {
        const finalWinner = Number(winner_id) === Number(matchBefore.competitor1_id) ? 'red' : 'blue';
        const fight = db.prepare(`
          SELECT id FROM fights
          WHERE bracket_id = ?
            AND (
              (competitor_red = ? AND competitor_blue = ?)
              OR (competitor_red = ? AND competitor_blue = ?)
            )
            AND status != 'completed'
        `).get(
          matchBefore.bracket_id,
          matchBefore.competitor1_name, matchBefore.competitor2_name,
          matchBefore.competitor2_name, matchBefore.competitor1_name
        );

        if (fight) {
          // Determinar final_winner según cuál nombre es red/blue en la pelea
          const fightRow = db.prepare('SELECT competitor_red FROM fights WHERE id = ?').get(fight.id);
          const isWinnerRed = fightRow.competitor_red === (
            Number(winner_id) === Number(matchBefore.competitor1_id)
              ? matchBefore.competitor1_name
              : matchBefore.competitor2_name
          );
          db.prepare(`
            UPDATE fights SET status = 'completed', final_winner = ?, victory_type = 'bracket', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(isWinnerRed ? 'red' : 'blue', fight.id);
        }
      }

      // Si hay un siguiente match listo (ambos competidores definidos), crear nueva pelea
      if (result.nextMatchReady) {
        const nextMatch = result.nextMatchReady;
        // Obtener el tournament_id del bracket
        const bracket = db.prepare('SELECT tournament_id FROM brackets WHERE id = ?').get(result.bracket_id);
        
        if (bracket) {
          // Crear nueva pelea con los competidores del siguiente match
          const newFight = FightService.createFight({
            tournament_id: bracket.tournament_id,
            bracket_id: result.bracket_id,
            competitor_red: nextMatch.competitor1_name,
            competitor_blue: nextMatch.competitor2_name,
            academy_red: nextMatch.competitor1_academy || '',
            academy_blue: nextMatch.competitor2_academy || ''
          });
          
          res.json({ 
            success: true, 
            matches: result.matches,
            newFight,
            message: `Nueva pelea creada: ${nextMatch.competitor1_name} vs ${nextMatch.competitor2_name}`
          });
          return;
        }
      }
      
      res.json({ success: true, matches: result.matches });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Reordenar competidores actualizando sus seeds
  reorderCompetitors(req, res) {
    try {
      const { bracket_id } = req.params;
      const { orderedIds } = req.body;
      Bracket.reorderCompetitors(parseInt(bracket_id), orderedIds);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Eliminar un competidor del bracket
  removeCompetitor(req, res) {
    try {
      const { competitor_id } = req.params;
      Bracket.removeCompetitor(parseInt(competitor_id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};
