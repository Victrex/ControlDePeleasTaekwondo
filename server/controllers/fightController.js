import { FightService } from "../services/fightService.js";
import { Fight } from "../models/Fight.js";
import { TournamentConfig } from "../models/TournamentConfig.js";
import db from "../config/database.js";
import { bracketController } from "./bracketController.js";
import { timerService } from "../services/timerService.js";

export const fightController = {
  // Crear pelea
  create(req, res) {
    try {
      // Crear automáticamente una nueva llave (bracket) con correlativo
      const { tournament_id } = req.body;
      // Contar cuántas llaves existen para el torneo
      const countStmt = db.prepare(
        "SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?",
      );
      const { count } = countStmt.get(tournament_id);
      const bracketName = `Llave ${count + 1}`;
      const bracketStmt = db.prepare(
        "INSERT INTO brackets (tournament_id, name) VALUES (?, ?)",
      );
      const bracketResult = bracketStmt.run(tournament_id, bracketName);
      const bracketId = bracketResult.lastInsertRowid;

      // Crear pelea con el bracket_id
      const fight = FightService.createFight({
        ...req.body,
        bracket_id: bracketId,
      });
      res.json({ success: true, fight, bracket_id: bracketId });
    } catch (error) {
      console.error("Error creando pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },
  createFightsForBracket(req, res) {
    try {
      // Crear automáticamente una nueva llave (bracket) con correlativo
      const { tournament_id, competitors } = req.body;
      // Contar cuántas llaves existen para el torneo
      const countStmt = db.prepare(
        "SELECT COUNT(*) as count FROM brackets WHERE tournament_id = ?",
      );
      const { count } = countStmt.get(tournament_id);
      const bracketName = `Llave ${count + 1}`;
      const bracketStmt = db.prepare(
        "INSERT INTO brackets (tournament_id, name) VALUES (?, ?)",
      );
      console.log(
        "Creando bracket con nombre:",
        bracketName,
        "y competidores:",
        competitors,
      );
      const bracketResult = bracketStmt.run(tournament_id, bracketName);
      const bracketId = bracketResult.lastInsertRowid;
      console.log(bracketId)
      let fightsCreated = [];
      if (competitors.length > 0) {
        for (let idx = 0; idx < competitors.length; idx += 2) {
          // Para la pelea principal, usar los dos primeros
          if(idx + 2 > competitors.length) {
            console.log('Competidor sin rival, avanzando automáticamente:', competitors[idx]?.name);
          } else {

            console.log('se creo pelea p1:', competitors[idx]?.name, ' p2: ', competitors[idx+1]?.name);
            const fight = FightService.createFight({
              tournament_id,
              competitor_red: competitors[idx]?.name || "",
              competitor_blue: competitors[idx + 1]?.name || "",
              academy_red: competitors[idx]?.academy || "",
              academy_blue: competitors[idx + 1]?.academy || "",
              bracket_id: bracketId,
            });
            fightsCreated.push(fight);
          }
        }
      }
      res.json({
        success: true,
        bracket_id: bracketId,
        fights_created: fightsCreated.length,
        fights: fightsCreated,
      });
    } catch (error) {
      console.error("Error creando peleas para bracket:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener todas las peleas de un torneo
  getByTournament(req, res) {
    try {
      const { tournamentId } = req.params;
      const fights = FightService.getTournamentFights(parseInt(tournamentId));
      res.json(fights);
    } catch (error) {
      console.error("Error obteniendo peleas:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener pelea por ID
  getById(req, res) {
    try {
      const { id } = req.params;
      const fight = Fight.findById(parseInt(id));

      if (!fight) {
        return res.status(404).json({ error: "Pelea no encontrada" });
      }

      res.json(fight);
    } catch (error) {
      console.error("Error obteniendo pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener pelea actual
  getCurrent(req, res) {
    try {
      const { tournamentId } = req.params;
      const { pista, all } = req.query;
      
      if (all === '1') {
        // Retornar todas las peleas actuales (una por pista)
        const fights = Fight.getAllCurrentFights(parseInt(tournamentId));
        return res.json(fights);
      }
      
      let fight;
      if (pista) {
        fight = Fight.getCurrentFightByPista(parseInt(tournamentId), parseInt(pista));
      } else {
        fight = Fight.getCurrentFight(parseInt(tournamentId));
      }
      res.json(fight || null);
    } catch (error) {
      console.error("Error obteniendo pelea actual:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener próxima pelea
  getNext(req, res) {
    try {
      const { tournamentId } = req.params;
      const fight = Fight.getNextPendingFight(parseInt(tournamentId));
      res.json(fight || null);
    } catch (error) {
      console.error("Error obteniendo próxima pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Actualizar pelea
  update(req, res) {
    try {
      const { id } = req.params;
      const fight = FightService.updateFight(parseInt(id), req.body);
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error actualizando pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Reordenar peleas
  reorder(req, res) {
    try {
      const { fightOrders } = req.body;
      const result = FightService.reorderFights(fightOrders);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error reordenando peleas:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Registrar resultado
  registerResult(req, res) {
    try {
      const { id } = req.params;
      const fight = FightService.registerResult(parseInt(id), req.body);
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error registrando resultado:", error);
      res.status(400).json({ error: error.message });
    }
  },

  // Marcar como actual
  setAsCurrent(req, res) {
    try {
      const { id } = req.params;
      const { tournamentId } = req.body;
      const fight = FightService.setCurrentFight(parseInt(id), tournamentId);
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error marcando pelea como actual:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Completar y avanzar
  completeAndAdvance(req, res) {
    try {
      const { id } = req.params;
      const { tournamentId } = req.body;
      const result = FightService.completeAndAdvance(
        parseInt(id),
        tournamentId,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error completando pelea:", error);
      res.status(400).json({ error: error.message });
    }
  },

  // Repetir pelea completada
  repeatFight(req, res) {
    try {
      const { id } = req.params;
      const { tournamentId } = req.body;
      // Limpiar estado de timer en memoria
      timerService.cleanup(parseInt(id));
      const fight = FightService.repeatFight(parseInt(id), tournamentId);
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error repitiendo pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Cancelar pelea
  cancel(req, res) {
    try {
      const { id } = req.params;
      const fight = FightService.cancelFight(parseInt(id));
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error cancelando pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Posponer pelea
  postpone(req, res) {
    try {
      const { id } = req.params;
      const fight = FightService.postponeFight(parseInt(id));
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error posponiendo pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Adelantar pelea
  advance(req, res) {
    try {
      const { id } = req.params;
      const fight = FightService.advanceFight(parseInt(id));
      res.json({ success: true, fight });
    } catch (error) {
      console.error("Error adelantando pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Eliminar pelea
  delete(req, res) {
    try {
      const { id } = req.params;
      const result = FightService.deleteFight(parseInt(id));
      res.json(result);
    } catch (error) {
      console.error("Error eliminando pelea:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener estadísticas
  getStats(req, res) {
    try {
      const { tournamentId } = req.params;
      const stats = FightService.getTournamentStats(parseInt(tournamentId));
      res.json(stats);
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      res.status(500).json({ error: error.message });
    }
  },
};
