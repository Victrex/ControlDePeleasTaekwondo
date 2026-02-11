import { User } from '../models/User.js';

export const authController = {
  // Login
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
      }

      const user = await User.validateCredentials(username, password);
      
      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      // Guardar usuario en sesión
      req.session.user = user;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  },

  // Logout
  logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al cerrar sesión' });
      }
      res.json({ success: true });
    });
  },

  // Verificar sesión
  checkSession(req, res) {
    if (req.session && req.session.user) {
      res.json({
        authenticated: true,
        user: req.session.user
      });
    } else {
      res.json({ authenticated: false });
    }
  },

  // Crear nuevo usuario (solo admin)
  async createUser(req, res) {
    try {
      const { username, password, role } = req.body;

      if (!username || !password || !role) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
      }

      if (!['admin', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
      }

      const user = await User.create({ username, password, role });

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
      }
      console.error('Error creando usuario:', error);
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  },

  // Listar usuarios (solo admin)
  listUsers(req, res) {
    try {
      const users = User.findAll();
      res.json(users);
    } catch (error) {
      console.error('Error listando usuarios:', error);
      res.status(500).json({ error: 'Error al listar usuarios' });
    }
  }
};
