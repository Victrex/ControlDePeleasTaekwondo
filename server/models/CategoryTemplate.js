import db from '../config/database.js';

export class CategoryTemplate {
  static findAll() {
    return db.prepare('SELECT * FROM category_templates ORDER BY min_age ASC, name ASC').all();
  }

  static findById(id) {
    return db.prepare('SELECT * FROM category_templates WHERE id = ?').get(id);
  }

  static create(data) {
    const { name, gender, min_age, max_age, min_weight, max_weight, belt_min, belt_max } = data;
    const result = db.prepare(`
      INSERT INTO category_templates (name, gender, min_age, max_age, min_weight, max_weight, belt_min, belt_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      gender || 'Both',
      min_age ?? 0,
      max_age ?? 99,
      min_weight ?? 0,
      max_weight ?? 999,
      belt_min ?? 0,
      belt_max ?? 6
    );
    return this.findById(result.lastInsertRowid);
  }

  static update(id, data) {
    const { name, gender, min_age, max_age, min_weight, max_weight, belt_min, belt_max } = data;
    db.prepare(`
      UPDATE category_templates
      SET name=?, gender=?, min_age=?, max_age=?, min_weight=?, max_weight=?, belt_min=?, belt_max=?
      WHERE id=?
    `).run(name, gender, min_age, max_age, min_weight, max_weight, belt_min, belt_max, id);
    return this.findById(id);
  }

  static delete(id) {
    return db.prepare('DELETE FROM category_templates WHERE id = ?').run(id);
  }
}
