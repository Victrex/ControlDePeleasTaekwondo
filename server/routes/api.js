import express from 'express';
import { authController } from '../controllers/authController.js';
import { fightController } from '../controllers/fightController.js';
import { tournamentController } from '../controllers/tournamentController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { bracketController } from '../controllers/bracketController.js';
import { scoringController } from '../controllers/scoringController.js';
import { analyticsController } from '../controllers/analyticsController.js';
import { athleteController } from '../controllers/athleteController.js';
import { categoryController } from '../controllers/categoryController.js';

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
router.post('/fights/:id/repeat', requireAdmin, fightController.repeatFight);
router.delete('/fights/:id', requireAdmin, fightController.delete);

// ============================================
// RUTAS DE LLAVES (BRACKETS)
// ============================================
router.post('/brackets', requireAdmin, bracketController.create);
router.get('/brackets/tournament/:tournament_id', bracketController.getByTournament);
router.post('/brackets/competitor', requireAdmin, bracketController.addCompetitor);
router.post('/brackets/batch-assign', requireAdmin, bracketController.batchAssign);
router.get('/brackets/:bracket_id/competitors', bracketController.getCompetitors);
router.post('/brackets/:bracket_id/generate', requireAdmin, bracketController.generateStructure);
router.get('/brackets/:bracket_id/matches', bracketController.getMatches);
router.post('/brackets/match/:match_id/winner', requireAdmin, bracketController.setMatchWinner);
router.put('/brackets/:bracket_id/competitors/reorder', requireAdmin, bracketController.reorderCompetitors);
router.delete('/brackets/competitor/:competitor_id', requireAdmin, bracketController.removeCompetitor);
router.delete('/brackets/:bracket_id', requireAdmin, bracketController.deleteBracket);

// ============================================
// RUTAS DE ATLETAS
// ============================================
router.get('/athletes', requireAuth, athleteController.getAll);
router.post('/athletes/import', requireAdmin, athleteController.importBatch);
router.delete('/athletes', requireAdmin, athleteController.deleteAll);
router.post('/athletes/suggest-category', requireAuth, athleteController.suggestCategoryFromData);
router.get('/athletes/:id/suggest-category', requireAuth, athleteController.suggestCategory);
router.get('/athletes/:id/brackets', requireAuth, athleteController.getBracketAssignments);
router.get('/athletes/:id', requireAuth, athleteController.getById);
router.post('/athletes', requireAdmin, athleteController.create);
router.put('/athletes/:id', requireAdmin, athleteController.update);
router.delete('/athletes/:id', requireAdmin, athleteController.delete);

// ============================================
// RUTAS DE PLANTILLAS DE CATEGORÍAS
// ============================================
router.get('/categories', requireAuth, categoryController.getAll);
router.post('/categories', requireAdmin, categoryController.create);
router.put('/categories/:id', requireAdmin, categoryController.update);
router.delete('/categories/:id', requireAdmin, categoryController.delete);

// ============================================
// RUTAS DE SCORING / PUNTUACIÓN
// ============================================
// Estado completo de scoring de una pelea (público)
router.get('/scoring/:fightId/state', scoringController.getFightScoringState);
router.get('/scoring/:fightId/breakdown', scoringController.getBreakdown);

// Config de scoring por torneo
router.get('/scoring/config/:tournamentId', scoringController.getConfig);
router.put('/scoring/config/:tournamentId', requireAdmin, scoringController.updateConfig);

// Timer controls (admin)
router.post('/scoring/:fightId/start-timer', requireAdmin, scoringController.startTimer);
router.post('/scoring/:fightId/stop-timer', requireAdmin, scoringController.stopTimer);
router.post('/scoring/:fightId/reset-timer', requireAdmin, scoringController.resetTimer);
router.post('/scoring/:fightId/kye-shie', requireAdmin, scoringController.startKyeShie);
router.post('/scoring/:fightId/kye-shie/cancel', requireAdmin, scoringController.cancelKyeShie);

// Gam-jeom (admin)
router.post('/scoring/:fightId/gam-jeom', requireAdmin, scoringController.addGamJeom);
router.post('/scoring/:fightId/remove-gam-jeom', requireAdmin, scoringController.removeGamJeom);

// Admin direct score (bypasses judge consensus)
router.post('/scoring/:fightId/add-score', requireAdmin, scoringController.adminAddScore);

// Set exact score / timer / round (admin)
router.post('/scoring/:fightId/set-score', requireAdmin, scoringController.setScore);
router.post('/scoring/:fightId/set-round', requireAdmin, scoringController.setRound);
router.post('/scoring/:fightId/set-timer', requireAdmin, scoringController.setTimer);

// Score editing (admin, timer must be stopped)
router.put('/scoring/:fightId/edit-score', requireAdmin, scoringController.editScore);
router.delete('/scoring/:fightId/score/:scoreId', requireAdmin, scoringController.deleteScore);
router.post('/scoring/:fightId/clear-current-score', requireAdmin, scoringController.clearCurrentRoundScore);

// Round management (admin)
router.post('/scoring/:fightId/end-round', requireAdmin, scoringController.endRound);
router.post('/scoring/:fightId/round-winner', requireAdmin, scoringController.setRoundWinner);

// ============================================
// RUTAS DE ANALÍTICAS / DASHBOARD
// ============================================
router.get('/analytics/global',           analyticsController.getGlobalMetrics);
router.get('/analytics/top',              analyticsController.getTopStats);
router.get('/analytics/academies',        analyticsController.getAcademyRanking);
router.get('/analytics/competitors',      analyticsController.getCompetitorRanking);
router.get('/analytics/tournaments',      analyticsController.getTournamentMetrics);
router.get('/analytics/brackets',              analyticsController.getBracketMetrics);
router.get('/analytics/competitor/:name',      analyticsController.getCompetitorDetail);
router.get('/analytics/academy/:name',         analyticsController.getAcademyDetail);
router.get('/analytics/scoring',               analyticsController.getScoringMetrics);
router.get('/analytics/scoring/competitors',   analyticsController.getScoringCompetitors);

export default router;
