import { Fight } from '../models/Fight.js';
import { TournamentConfig } from '../models/TournamentConfig.js';

export class ValidationService {
  // Validar descanso mínimo de un competidor
  static validateRestPeriod(tournamentId, competitorName, proposedOrderIndex) {
    const config = TournamentConfig.get();
    
    if (!config.enable_auto_validation) {
      return { valid: true, message: 'Validación automática deshabilitada' };
    }

    const minRestFights = config.min_rest_fights;
    
    // Obtener todas las peleas del torneo ordenadas
    const allFights = Fight.findByTournament(tournamentId);
    
    // Buscar la última pelea completada de este competidor
    const lastCompletedFight = allFights
      .filter(f => 
        f.status === 'completed' && 
        (f.competitor_red === competitorName || f.competitor_blue === competitorName)
      )
      .sort((a, b) => b.order_index - a.order_index)[0];

    if (!lastCompletedFight) {
      return { valid: true, message: 'Primera pelea del competidor' };
    }

    // Contar peleas completadas entre la última del competidor y la propuesta
    const fightsBetween = allFights.filter(f => 
      f.order_index > lastCompletedFight.order_index && 
      f.order_index < proposedOrderIndex &&
      f.status === 'completed'
    ).length;

    if (fightsBetween < minRestFights) {
      return {
        valid: false,
        message: `${competitorName} necesita al menos ${minRestFights} peleas de descanso. Solo tiene ${fightsBetween}.`,
        required: minRestFights,
        current: fightsBetween
      };
    }

    return { valid: true, message: 'Descanso suficiente' };
  }

  // Validar conflictos en el orden (competidores duplicados)
  static validateOrderConflicts(fights) {
    const conflicts = [];
    const competitorLastPosition = new Map();

    // Ordenar peleas por order_index
    const sortedFights = [...fights].sort((a, b) => a.order_index - b.order_index);

    for (const fight of sortedFights) {
      if (fight.status === 'cancelled') continue;

      const competitors = [fight.competitor_red, fight.competitor_blue];

      for (const competitor of competitors) {
        const lastPos = competitorLastPosition.get(competitor);
        
        if (lastPos !== undefined && lastPos === fight.order_index) {
          conflicts.push({
            fightId: fight.id,
            competitor,
            message: `${competitor} tiene múltiples peleas en la misma posición`
          });
        }

        competitorLastPosition.set(competitor, fight.order_index);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts
    };
  }

  // Validar si se puede mover una pelea a cierta posición
  static canMoveFight(fight, newOrderIndex, allFights) {
    const config = TournamentConfig.get();
    
    if (!config.enable_auto_validation) {
      return { canMove: true, warnings: [] };
    }

    const warnings = [];

    // Validar descanso para ambos competidores
    const redValidation = this.validateRestPeriod(fight.tournament_id, fight.competitor_red, newOrderIndex);
    const blueValidation = this.validateRestPeriod(fight.tournament_id, fight.competitor_blue, newOrderIndex);

    if (!redValidation.valid) {
      warnings.push(redValidation.message);
    }

    if (!blueValidation.valid) {
      warnings.push(blueValidation.message);
    }

    // Validar conflictos con otras peleas
    const updatedFights = allFights.map(f => 
      f.id === fight.id ? { ...f, order_index: newOrderIndex } : f
    );

    const conflictValidation = this.validateOrderConflicts(updatedFights);
    if (conflictValidation.hasConflicts) {
      warnings.push(...conflictValidation.conflicts.map(c => c.message));
    }

    return {
      canMove: warnings.length === 0,
      warnings
    };
  }

  // Validar resultado de pelea
  static validateResult(fight, resultData, config) {
    const errors = [];

    // Validar según tipo de victoria
    if (resultData.victory_type === 'rounds') {
      // Para victoria por rounds, requerir ganadores según la configuración
      if (config.num_rounds === 2) {
        if (!resultData.round_1_winner || !resultData.round_2_winner) {
          errors.push('Se requieren ganadores para ambos rounds');
        }
      } else if (config.num_rounds === 3) {
        if (!resultData.round_1_winner || !resultData.round_2_winner || !resultData.round_3_winner) {
          errors.push('Se requieren ganadores para los tres rounds');
        }
      }
    }

    // Validar tipo de victoria
    if (resultData.victory_type === 'rounds' && !config.allow_victory_by_rounds) {
      errors.push('Victoria por rounds no está permitida en este torneo');
    }

    if (resultData.victory_type === 'injury' && !config.allow_victory_by_injury) {
      errors.push('Victoria por lesión no está permitida en este torneo');
    }

    if (resultData.victory_type === 'abandon' && !config.allow_victory_by_abandon) {
      errors.push('Victoria por abandono no está permitida en este torneo');
    }

    // Si es victoria por rounds, calcular ganador automáticamente
    if (resultData.victory_type === 'rounds') {
      const roundWinners = [
        resultData.round_1_winner,
        resultData.round_2_winner,
        resultData.round_3_winner
      ].filter(Boolean);

      const redWins = roundWinners.filter(w => w === 'red').length;
      const blueWins = roundWinners.filter(w => w === 'blue').length;

      if (redWins > blueWins) {
        resultData.final_winner = 'red';
      } else if (blueWins > redWins) {
        resultData.final_winner = 'blue';
      } else {
        errors.push('No se puede determinar ganador por rounds (empate)');
      }
    }

    // Para victoria por lesión o abandono, debe especificarse ganador
    if ((resultData.victory_type === 'injury' || resultData.victory_type === 'abandon') && 
        !resultData.final_winner) {
      errors.push('Debe especificarse el ganador para victoria por ' + resultData.victory_type);
    }

    return {
      valid: errors.length === 0,
      errors,
      resultData
    };
  }

  // Validar que se puede avanzar a la siguiente pelea
  static canAdvanceToNext(currentFight) {
    if (!currentFight) return { canAdvance: false, message: 'No hay pelea actual' };

    if (currentFight.status !== 'current') {
      return { canAdvance: false, message: 'La pelea no está marcada como actual' };
    }

    if (!currentFight.final_winner) {
      return { canAdvance: false, message: 'Debe registrarse un ganador antes de avanzar' };
    }

    return { canAdvance: true };
  }
}
