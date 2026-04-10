import express from 'express';
import { authController } from '../controllers/authController.js';
import { fightController } from '../controllers/fightController.js';
import { tournamentController } from '../controllers/tournamentController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { bracketController } from '../controllers/bracketController.js';

const router = express.Router();

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/session', authController.checkSession);

// Solo admin puede crear usuarios
router.post('/auth/users', requireAdmin, authController.createUser);
router.get('/auth/users', requireAdmin, authController.listUsers);

// ============================================
// RUTAS DE CONFIGURACIÓN
// ============================================
router.get('/config', tournamentController.getConfig);
router.put('/config', requireAdmin, tournamentController.updateConfig);
router.post('/config/reset', requireAdmin, tournamentController.resetConfig);

// ============================================
// RUTAS DE TORNEOS
// ============================================
router.post('/tournaments', requireAdmin, tournamentController.create);
router.get('/tournaments', tournamentController.getAll);
router.get('/tournaments/active', tournamentController.getActive);
router.get('/tournaments/:id', tournamentController.getById);
router.put('/tournaments/:id', requireAdmin, tournamentController.update);
router.post('/tournaments/:id/complete', requireAdmin, tournamentController.complete);
router.post('/tournaments/:id/cancel', requireAdmin, tournamentController.cancel);
router.delete('/tournaments/:id', requireAdmin, tournamentController.delete);
router.get('/tournaments/:id/stats', tournamentController.getStats);

// ============================================
// RUTAS DE PODIOS
// ============================================
router.post('/tournaments/:id/podium', requireAdmin, tournamentController.generatePodium);
router.get('/tournaments/:id/podium', tournamentController.getPodium);
router.get('/podiums', tournamentController.getAllPodiums);

// ============================================
// RUTAS DE PELEAS
// ============================================
// Públicas (lectura)
router.get('/fights/tournament/:tournamentId', fightController.getByTournament);
router.get('/fights/tournament/:tournamentId/current', fightController.getCurrent);
router.get('/fights/tournament/:tournamentId/next', fightController.getNext);
router.get('/fights/tournament/:tournamentId/stats', fightController.getStats);
router.get('/fights/:id', fightController.getById);

// Privadas (requieren admin)
router.post('/fights', requireAdmin, fightController.create);
router.post('/fights/bracket', requireAdmin, fightController.createFightsForBracket);
router.put('/fights/:id', requireAdmin, fightController.update);
router.post('/fights/reorder', requireAdmin, fightController.reorder);
router.post('/fights/:id/result', requireAdmin, fightController.registerResult);
router.post('/fights/:id/set-current', requireAdmin, fightController.setAsCurrent);
router.post('/fights/:id/complete', requireAdmin, fightController.completeAndAdvance);
router.post('/fights/:id/cancel', requireAdmin, fightController.cancel);
router.post('/fights/:id/postpone', requireAdmin, fightController.postpone);
router.post('/fights/:id/advance', requireAdmin, fightController.advance);
router.delete('/fights/:id', requireAdmin, fightController.delete);

// ============================================
// RUTAS DE LLAVES (BRACKETS)
// ============================================
router.post('/brackets', requireAdmin, bracketController.create);
router.get('/brackets/tournament/:tournament_id', bracketController.getByTournament);
router.post('/brackets/competitor', requireAdmin, bracketController.addCompetitor);
router.get('/brackets/:bracket_id/competitors', bracketController.getCompetitors);
router.post('/brackets/:bracket_id/generate', requireAdmin, bracketController.generateStructure);
router.get('/brackets/:bracket_id/matches', bracketController.getMatches);
router.post('/brackets/match/:match_id/winner', requireAdmin, bracketController.setMatchWinner);

export default router;
