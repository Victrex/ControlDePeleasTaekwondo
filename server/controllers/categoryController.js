import { CategoryTemplate } from '../models/CategoryTemplate.js';

export const categoryController = {
  getAll(req, res) {
    try {
      res.json(CategoryTemplate.findAll());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  create(req, res) {
    try {
      const cat = CategoryTemplate.create(req.body);
      res.json({ success: true, category: cat });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  update(req, res) {
    try {
      const cat = CategoryTemplate.update(req.params.id, req.body);
      if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
      res.json({ success: true, category: cat });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  delete(req, res) {
    try {
      CategoryTemplate.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};
