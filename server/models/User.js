import db from '../config/database.js';
import bcrypt from 'bcryptjs';

export class User {
  // Crear nuevo usuario
  static async create(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(userData.username, hashedPassword, userData.role);
    return this.findById(result.lastInsertRowid);
  }

  // Buscar usuario por ID
  static findById(id) {
    const stmt = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // Buscar usuario por nombre de usuario
  static findByUsername(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  }

  // Obtener todos los usuarios
  static findAll() {
    const stmt = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC');
    return stmt.all();
  }

  // Validar credenciales
  static async validateCredentials(username, password) {
    const user = this.findByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;

    // No retornar el password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Actualizar contraseña
  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    stmt.run(hashedPassword, id);
    return true;
  }

  // Actualizar rol
  static updateRole(id, role) {
    const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
    stmt.run(role, id);
    return this.findById(id);
  }

  // Eliminar usuario
  static delete(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
