import { Athlete } from '../models/Athlete.js';

export const athleteController = {
  create(req, res) {
    try {
      const athlete = Athlete.create(req.body);
      res.json({ success: true, athlete });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getAll(req, res) {
    try {
      const { q, belt, gender, academy } = req.query;
      const athletes = Athlete.findAll({ q, belt, gender, academy });
      res.json(athletes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getById(req, res) {
    try {
      const athlete = Athlete.findById(req.params.id);
      if (!athlete) return res.status(404).json({ error: 'Atleta no encontrado' });
      res.json(athlete);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  update(req, res) {
    try {
      const athlete = Athlete.update(req.params.id, req.body);
      if (!athlete) return res.status(404).json({ error: 'Atleta no encontrado' });
      res.json({ success: true, athlete });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  delete(req, res) {
    try {
      Athlete.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/athletes/import  – body: { athletes: [...] }
  importBatch(req, res) {
    try {
      const { athletes } = req.body;
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array de atletas' });
      }
      const ids = Athlete.importBatch(athletes);
      res.json({ success: true, imported: ids.length, ids });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/athletes/:id/suggest-category
  suggestCategory(req, res) {
    try {
      const categories = Athlete.suggestCategories(req.params.id);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // POST /api/athletes/suggest-category  – body: { dob, weight, gender, belt }
  suggestCategoryFromData(req, res) {
    try {
      const categories = Athlete.suggestCategoriesForData(req.body);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // GET /api/athletes/:id/brackets
  getBracketAssignments(req, res) {
    try {
      const { tournamentId } = req.query;
      const assignments = Athlete.getBracketAssignments(req.params.id, tournamentId || null);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};
