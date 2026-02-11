import { Tournament } from '../models/Tournament.js';
import { TournamentConfig } from '../models/TournamentConfig.js';
import { PodiumService } from '../services/podiumService.js';
import { emitEvents } from '../config/socket.js';

export const tournamentController = {
  // Crear torneo
  create(req, res) {
    try {
      const tournament = Tournament.create(req.body);
      res.json({ success: true, tournament });
    } catch (error) {
      console.error('Error creando torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener todos los torneos
  getAll(req, res) {
    try {
      const tournaments = Tournament.findAll();
      res.json(tournaments);
    } catch (error) {
      console.error('Error obteniendo torneos:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener torneo por ID
  getById(req, res) {
    try {
      const { id } = req.params;
      const tournament = Tournament.findById(parseInt(id));
      
      if (!tournament) {
        return res.status(404).json({ error: 'Torneo no encontrado' });
      }

      res.json(tournament);
    } catch (error) {
      console.error('Error obteniendo torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener torneos activos
  getActive(req, res) {
    try {
      const tournaments = Tournament.findActive();
      res.json(tournaments);
    } catch (error) {
      console.error('Error obteniendo torneos activos:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Actualizar torneo
  update(req, res) {
    try {
      const { id } = req.params;
      const tournament = Tournament.update(parseInt(id), req.body);
      res.json({ success: true, tournament });
    } catch (error) {
      console.error('Error actualizando torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Completar torneo
  complete(req, res) {
    try {
      const { id } = req.params;
      const tournament = Tournament.complete(parseInt(id));
      res.json({ success: true, tournament });
    } catch (error) {
      console.error('Error completando torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Cancelar torneo
  cancel(req, res) {
    try {
      const { id } = req.params;
      const tournament = Tournament.cancel(parseInt(id));
      res.json({ success: true, tournament });
    } catch (error) {
      console.error('Error cancelando torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Eliminar torneo
  delete(req, res) {
    try {
      const { id } = req.params;
      const result = Tournament.delete(parseInt(id));
      res.json({ success: result });
    } catch (error) {
      console.error('Error eliminando torneo:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener estadísticas
  getStats(req, res) {
    try {
      const { id } = req.params;
      const stats = Tournament.getStats(parseInt(id));
      res.json(stats);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener configuración
  getConfig(req, res) {
    try {
      const config = TournamentConfig.get();
      res.json(config);
    } catch (error) {
      console.error('Error obteniendo configuración:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Actualizar configuración
  updateConfig(req, res) {
    try {
      const config = TournamentConfig.update(req.body);
      emitEvents.configUpdated(config);
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error actualizando configuración:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Resetear configuración
  resetConfig(req, res) {
    try {
      const config = TournamentConfig.reset();
      emitEvents.configUpdated(config);
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error reseteando configuración:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Generar podio
  generatePodium(req, res) {
    try {
      const { id } = req.params;
      const podium = PodiumService.generatePodium(parseInt(id));
      res.json({ success: true, podium });
    } catch (error) {
      console.error('Error generando podio:', error);
      res.status(400).json({ error: error.message });
    }
  },

  // Obtener podio
  getPodium(req, res) {
    try {
      const { id } = req.params;
      const podium = PodiumService.getPodium(parseInt(id));
      res.json(podium || null);
    } catch (error) {
      console.error('Error obteniendo podio:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener todos los podios
  getAllPodiums(req, res) {
    try {
      const podiums = PodiumService.getAllPodiums();
      res.json(podiums);
    } catch (error) {
      console.error('Error obteniendo podios:', error);
      res.status(500).json({ error: error.message });
    }
  }
};
