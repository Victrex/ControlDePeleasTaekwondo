import { Fight } from '../models/Fight.js';
import { Tournament } from '../models/Tournament.js';
import { TournamentConfig } from '../models/TournamentConfig.js';
import { ValidationService } from './validationService.js';
import { PodiumService } from './podiumService.js';
import { emitEvents } from '../config/socket.js';
import { Bracket } from '../models/Bracket.js';
import db from '../config/database.js';

export class FightService {
  // Crear nueva pelea con validaciones
  static createFight(fightData) {
    // Obtener el último order_index y fight_number
    const fights = Fight.findByTournament(fightData.tournament_id);
    const maxOrder = fights.length > 0 ? Math.max(...fights.map(f => f.order_index)) : 0;
    const maxFightNumber = fights.length > 0 ? Math.max(...fights.map(f => f.fight_number)) : 0;

    fightData.order_index = maxOrder + 1;
    fightData.fight_number = maxFightNumber + 1;

    // Asignar pista en round-robin si no se especificó
    if (!fightData.pista) {
      const tournament = Tournament.findById(fightData.tournament_id);
      const numPistas = tournament?.num_pistas || 1;
      // La pista se asigna basándose en el total de peleas existentes
      fightData.pista = (fights.length % numPistas) + 1;
    }

    const fight = Fight.create(fightData);

    // Emitir evento
    emitEvents.fightCreated(fight);

    return fight;
  }

  // Actualizar pelea con validaciones
  static updateFight(fightId, updates) {
    const fight = Fight.findById(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const updatedFight = Fight.update(fightId, updates);
    
    // Emitir evento
    emitEvents.fightUpdated(updatedFight);

    return updatedFight;
  }

  // Cambiar orden de peleas con drag & drop
  static reorderFights(fightOrders) {
    // Validación básica
    if (!fightOrders || fightOrders.length === 0) {
      return { success: false, warnings: ['No hay peleas para reordenar'] };
    }

    // Obtener tournament_id de la primera pelea
    const tournamentId = fightOrders[0].tournament_id;
    if (!tournamentId) {
      // Si no viene tournament_id, obtenerlo de la base de datos
      const firstFight = Fight.findById(fightOrders[0].id);
      if (!firstFight) {
        return { success: false, warnings: ['No se encontró la pelea'] };
      }
      // Añadir tournament_id a todos los elementos
      fightOrders.forEach(fo => fo.tournament_id = firstFight.tournament_id);
    }

    const allFights = Fight.findByTournament(fightOrders[0].tournament_id);
    
    if (!allFights || allFights.length === 0) {
      return { success: false, warnings: ['No se encontraron peleas del torneo'] };
    }

    const updatedFights = allFights.map(fight => {
      const newOrder = fightOrders.find(fo => fo.id === fight.id);
      return newOrder ? { ...fight, order_index: newOrder.order_index } : fight;
    });

    const validation = ValidationService.validateOrderConflicts(updatedFights);
    
    if (validation.hasConflicts) {
      return {
        success: false,
        warnings: validation.conflicts.map(c => c.message)
      };
    }

    // Validar descansos
    const warnings = [];
    for (const order of fightOrders) {
      const fight = allFights.find(f => f.id === order.id);
      if (fight) {
        const redValidation = ValidationService.validateRestPeriod(
          fight.tournament_id,
          fight.competitor_red,
          order.order_index
        );
        const blueValidation = ValidationService.validateRestPeriod(
          fight.tournament_id,
          fight.competitor_blue,
          order.order_index
        );

        if (!redValidation.valid) warnings.push(redValidation.message);
        if (!blueValidation.valid) warnings.push(blueValidation.message);
      }
    }

    // Actualizar orden
    Fight.updateOrder(fightOrders);

    // Obtener peleas actualizadas
    const updatedFightsList = Fight.findByTournament(fightOrders[0].tournament_id);

    // Emitir evento
    emitEvents.orderChanged(updatedFightsList);

    return {
      success: true,
      warnings,
      fights: updatedFightsList
    };
  }

  // Registrar resultado de pelea
  static registerResult(fightId, resultData) {
    const fight = Fight.findById(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const config = TournamentConfig.get();

    // Soportar registro incremental por round: { round, winner }
    if (resultData.round && resultData.winner) {
      const roundField = `round_${resultData.round}_winner`;
      const updatedFight = Fight.update(fightId, { [roundField]: resultData.winner });
      emitEvents.resultRegistered(updatedFight);
      return updatedFight;
    }

    // Registro completo (con victory_type/finalización)
    const validation = ValidationService.validateResult(fight, resultData, config);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const updatedFight = Fight.update(fightId, validation.resultData);
    emitEvents.resultRegistered(updatedFight);
    return updatedFight;
  }

  // Marcar pelea como actual
  static setCurrentFight(fightId, tournamentId) {
    const currentFight = Fight.setAsCurrent(fightId, tournamentId);

    // Emitir evento
    emitEvents.currentFightChanged(currentFight);

    return currentFight;
  }

  // Completar pelea actual y avanzar a la siguiente
  static completeAndAdvance(fightId, tournamentId) {
    let fight = Fight.findById(fightId);
    
    // Si no hay final_winner, intentar calcularlo por rounds
    if (!fight.final_winner) {
      const config = TournamentConfig.get();
      const rounds = [fight.round_1_winner, fight.round_2_winner, fight.round_3_winner].filter(Boolean);
      const redWins = rounds.filter(w => w === 'red').length;
      const blueWins = rounds.filter(w => w === 'blue').length;
      const neededWins = config.num_rounds === 3 ? 2 : 2; // mejor de 3 requiere 2, mejor de 2 requiere 2
      if (redWins >= neededWins || blueWins >= neededWins || (config.num_rounds === 2 && rounds.length === 2)) {
        const final_winner = redWins > blueWins ? 'red' : (blueWins > redWins ? 'blue' : null);
        if (final_winner) {
          fight = Fight.update(fightId, { final_winner, victory_type: 'rounds' });
        }
      }
    }

    // Validar que se puede avanzar
    const validation = ValidationService.canAdvanceToNext(fight);
    if (!validation.canAdvance) {
      throw new Error(validation.message);
    }

    // Completar pelea actual
    const completedFight = Fight.complete(fightId, tournamentId);

    // Emitir evento de resultado registrado si hay ganador final
    if (completedFight.final_winner) {
      emitEvents.resultRegistered(completedFight);
    }

    // Si la pelea tiene bracket_id, actualizar el bracket
    if (completedFight.bracket_id && completedFight.final_winner) {
      this.updateBracketFromFight(completedFight);
    }

    // Buscar siguiente pelea pendiente
    const nextFight = Fight.getNextPendingFight(tournamentId);

    if (nextFight) {
      // Verificar si la pelea pertenece a un bracket con múltiples peleas
      const bracketHasMultipleFights = completedFight.bracket_id && 
        Fight.findByTournament(tournamentId).filter(f => f.bracket_id === completedFight.bracket_id).length > 1;
      
      // Solo marcar automáticamente como actual si NO es un bracket con múltiples peleas
      if (!bracketHasMultipleFights) {
        Fight.setAsCurrent(nextFight.id, tournamentId);
        emitEvents.currentFightChanged(nextFight);
      }
      // Si es bracket con múltiples peleas, la pelea queda en 'pending' hasta que se inicie manualmente
    } else {
      // No hay más peleas, verificar si se puede generar podio
      const allCompleted = Fight.allCompleted(tournamentId);
      if (allCompleted) {
        try {
          const podium = PodiumService.generatePodium(tournamentId);
          emitEvents.podiumGenerated(podium);
          emitEvents.tournamentCompleted(tournamentId);
        } catch (error) {
          console.error('Error generando podio:', error.message);
        }
      }
    }

    emitEvents.fightUpdated(completedFight);

    return {
      completedFight,
      nextFight: nextFight || null
    };
  }

  // Cancelar pelea
  static cancelFight(fightId) {
    const fight = Fight.cancel(fightId);
    emitEvents.fightUpdated(fight);
    return fight;
  }

  // Posponer pelea
  static postponeFight(fightId) {
    const fight = Fight.postpone(fightId);
    emitEvents.fightUpdated(fight);
    return fight;
  }

  // Adelantar pelea (moverla al principio de las pendientes)
  static advanceFight(fightId) {
    const fight = Fight.findById(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    const allFights = Fight.findByTournament(fight.tournament_id);
    const pendingFights = allFights.filter(f => f.status === 'pending' && f.id !== fightId);

    // Obtener el menor order_index de las pendientes
    const minOrder = pendingFights.length > 0 
      ? Math.min(...pendingFights.map(f => f.order_index))
      : fight.order_index;

    // Mover esta pelea antes de todas las pendientes
    const newOrder = minOrder - 1;

    const updatedFight = Fight.update(fightId, { order_index: newOrder });

    // Reordenar todas las peleas
    const reorderedFights = Fight.findByTournament(fight.tournament_id);
    emitEvents.orderChanged(reorderedFights);

    return updatedFight;
  }

  // Eliminar pelea
  static deleteFight(fightId) {
    const fight = Fight.findById(fightId);
    if (!fight) throw new Error('Pelea no encontrada');

    Fight.delete(fightId);
    emitEvents.fightDeleted(fightId);

    return { success: true };
  }

  // Obtener todas las peleas de un torneo
  static getTournamentFights(tournamentId) {
    return Fight.findByTournament(tournamentId);
  }

  // Obtener estadísticas de un torneo
  static getTournamentStats(tournamentId) {
    const fights = Fight.findByTournament(tournamentId);
    
    return {
      total: fights.length,
      pending: fights.filter(f => f.status === 'pending').length,
      current: fights.filter(f => f.status === 'current').length,
      completed: fights.filter(f => f.status === 'completed').length,
      cancelled: fights.filter(f => f.status === 'cancelled').length,
      postponed: fights.filter(f => f.status === 'postponed').length
    };
  }

  // Actualizar bracket cuando una pelea se completa
  static updateBracketFromFight(fight) {
    try {
      // Buscar el match correspondiente en bracket_matches que tenga los mismos competidores
      const matches = Bracket.getMatches(fight.bracket_id);

      // Buscar match que coincida con los competidores de la pelea (por nombre),
      // incluyendo matches ya completados para evitar duplicados pero usando el
      // estado "pending" para encontrar el que hay que resolver ahora.
      const matchingMatch = matches.find(m => {
        const names = [m.competitor1_name, m.competitor2_name];
        return names.includes(fight.competitor_red) &&
               names.includes(fight.competitor_blue) &&
               m.status !== 'completed';
      });

      if (!matchingMatch) {
        console.log('No se encontró match pendiente para actualizar en el bracket');
        return;
      }

      // Determinar winner_id según el ganador de la pelea
      const winnerName = fight.final_winner === 'red' ? fight.competitor_red : fight.competitor_blue;
      let winnerId = null;
      if (matchingMatch.competitor1_name === winnerName) {
        winnerId = matchingMatch.competitor1_id;
      } else if (matchingMatch.competitor2_name === winnerName) {
        winnerId = matchingMatch.competitor2_id;
      }

      if (!winnerId) {
        console.log('No se pudo determinar winner_id para el bracket');
        return;
      }

      // Resolver el match (propaga ganador y hace auto-resolve de BYEs en cascada)
      Bracket.setMatchWinner(matchingMatch.id, winnerId);

      // Tras la propagación, buscar TODOS los matches con ambos competidores reales
      // y que aún no tengan una pelea asociada → crear la pelea faltante.
      const updatedMatches = Bracket.getMatches(fight.bracket_id);
      const pendingWithBoth = updatedMatches.filter(m =>
        m.competitor1_id && m.competitor2_id && m.status !== 'completed'
      );

      for (const nextMatch of pendingWithBoth) {
        const existingFight = db.prepare(`
          SELECT id FROM fights WHERE bracket_id = ?
          AND (
            (competitor_red = ? AND competitor_blue = ?)
            OR (competitor_red = ? AND competitor_blue = ?)
          )
        `).get(
          fight.bracket_id,
          nextMatch.competitor1_name, nextMatch.competitor2_name,
          nextMatch.competitor2_name, nextMatch.competitor1_name
        );

        if (!existingFight) {
          const newFight = this.createFightFromMatch(fight.tournament_id, fight.bracket_id, nextMatch);
          console.log('Nueva pelea de bracket creada automáticamente:', newFight.id,
            `(${nextMatch.competitor1_name} vs ${nextMatch.competitor2_name})`);
        }
      }
    } catch (error) {
      console.error('Error actualizando bracket desde pelea:', error);
    }
  }

  // Repetir una pelea completada: la resetea y la pone como actual
  static repeatFight(fightId, tournamentId) {
    const fight = Fight.findById(fightId);
    if (!fight) throw new Error('Pelea no encontrada');
    if (fight.status !== 'completed') throw new Error('Solo se puede repetir una pelea completada');

    const pista = fight.pista || 1;

    // Enviar cualquier pelea actual de la misma pista a la cola
    db.prepare(
      "UPDATE fights SET status = 'pending' WHERE tournament_id = ? AND status = 'current' AND pista = ?"
    ).run(tournamentId, pista);

    // Resetear scores y ganadores, y poner la pelea como actual
    db.prepare(`
      UPDATE fights SET
        status = 'current',
        final_winner = NULL,
        victory_type = NULL,
        round_1_winner = NULL,
        round_2_winner = NULL,
        round_3_winner = NULL,
        score_red = 0,
        score_blue = 0,
        gam_jeom_red = 0,
        gam_jeom_blue = 0,
        current_round = 1,
        timer_remaining_ms = NULL,
        timer_running = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(fightId);

    // Eliminar todos los eventos de puntuación de esta pelea
    db.prepare('DELETE FROM fight_scores WHERE fight_id = ?').run(fightId);
    db.prepare('DELETE FROM judge_inputs WHERE fight_id = ?').run(fightId);

    const updatedFight = Fight.findById(fightId);
    emitEvents.fightUpdated(updatedFight);
    emitEvents.currentFightChanged(updatedFight);

    return updatedFight;
  }

  // Crear pelea desde un match de bracket
  static createFightFromMatch(tournamentId, bracketId, match) {
    const fightData = {
      tournament_id: tournamentId,
      bracket_id: bracketId,
      competitor_red: match.competitor1_name,
      competitor_blue: match.competitor2_name,
      academy_red: match.competitor1_academy || '',
      academy_blue: match.competitor2_academy || '',
      category: 'Bracket Match',
      status: 'pending'
    };
    
    // Obtener el último order_index y fight_number
    const fights = Fight.findByTournament(tournamentId);
    const maxOrder = fights.length > 0 ? Math.max(...fights.map(f => f.order_index)) : 0;
    const maxFightNumber = fights.length > 0 ? Math.max(...fights.map(f => f.fight_number)) : 0;
    
    fightData.order_index = maxOrder + 1;
    fightData.fight_number = maxFightNumber + 1;
    
    const fight = Fight.create(fightData);
    emitEvents.fightCreated(fight);
    
    return fight;
  }
}
