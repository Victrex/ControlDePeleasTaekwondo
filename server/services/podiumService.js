import db from '../config/database.js';
import { Fight } from '../models/Fight.js';
import { Tournament } from '../models/Tournament.js';

export class PodiumService {
  // Generar podio automáticamente para una llave
  static generatePodium(tournamentId) {
    const tournament = Tournament.findById(tournamentId);
    if (!tournament) {
      throw new Error('Torneo no encontrado');
    }

    // Verificar que todas las peleas estén completadas
    const allCompleted = Fight.allCompleted(tournamentId);
    if (!allCompleted) {
      throw new Error('No se puede generar el podio hasta que todas las peleas estén completadas');
    }

    const fights = Fight.findByTournament(tournamentId);
    
    // Identificar estructura del bracket
    const bracketStructure = this.analyzeBracketStructure(fights);
    
    // Generar podio según estructura
    let podium;
    if (bracketStructure.type === 'simple_4') {
      podium = this.generatePodiumFor4Competitors(fights);
    } else if (bracketStructure.type === 'simple_8') {
      podium = this.generatePodiumFor8Competitors(fights);
    } else if (bracketStructure.type === 'elimination') {
      podium = this.generatePodiumForElimination(fights);
    } else {
      throw new Error('Estructura de bracket no reconocida');
    }

    // Guardar podio en base de datos
    this.savePodium(tournamentId, podium);

    // Marcar torneo como completado
    Tournament.complete(tournamentId);

    return podium;
  }

  // Analizar estructura del bracket
  static analyzeBracketStructure(fights) {
    const uniqueCompetitors = new Set();
    fights.forEach(f => {
      uniqueCompetitors.add(f.competitor_red);
      uniqueCompetitors.add(f.competitor_blue);
    });

    const numCompetitors = uniqueCompetitors.size;
    const numFights = fights.length;

    if (numCompetitors === 4 && numFights === 3) {
      return { type: 'simple_4', competitors: numCompetitors };
    } else if (numCompetitors === 8 && numFights === 7) {
      return { type: 'simple_8', competitors: numCompetitors };
    } else {
      return { type: 'elimination', competitors: numCompetitors };
    }
  }

  // Generar podio para bracket de 4 competidores
  static generatePodiumFor4Competitors(fights) {
    // Estructura: 2 semifinales + 1 final
    // Semifinal 1, Semifinal 2, Final

    const final = fights.find(f => f.bracket_round === 'final');
    const semifinals = fights.filter(f => f.bracket_round === 'semifinal');

    if (!final || semifinals.length !== 2) {
      throw new Error('Estructura de bracket incompleta para 4 competidores');
    }

    const firstPlace = final.final_winner === 'red' ? {
      name: final.competitor_red,
      academy: final.academy_red
    } : {
      name: final.competitor_blue,
      academy: final.academy_blue
    };

    const secondPlace = final.final_winner === 'red' ? {
      name: final.competitor_blue,
      academy: final.academy_blue
    } : {
      name: final.competitor_red,
      academy: final.academy_red
    };

    // Terceros lugares: perdedores de semifinales
    const thirdPlaces = semifinals.map(sf => {
      const loser = sf.final_winner === 'red' ? {
        name: sf.competitor_blue,
        academy: sf.academy_blue
      } : {
        name: sf.competitor_red,
        academy: sf.academy_red
      };
      return loser;
    });

    return {
      first_place: firstPlace.name,
      first_place_academy: firstPlace.academy,
      second_place: secondPlace.name,
      second_place_academy: secondPlace.academy,
      third_place_1: thirdPlaces[0].name,
      third_place_1_academy: thirdPlaces[0].academy,
      third_place_2: thirdPlaces[1].name,
      third_place_2_academy: thirdPlaces[1].academy
    };
  }

  // Generar podio para bracket de 8 competidores
  static generatePodiumFor8Competitors(fights) {
    // Estructura: 4 cuartos + 2 semis + 1 final
    const final = fights.find(f => f.bracket_round === 'final');
    const semifinals = fights.filter(f => f.bracket_round === 'semifinal');

    if (!final || semifinals.length !== 2) {
      throw new Error('Estructura de bracket incompleta para 8 competidores');
    }

    const firstPlace = final.final_winner === 'red' ? {
      name: final.competitor_red,
      academy: final.academy_red
    } : {
      name: final.competitor_blue,
      academy: final.academy_blue
    };

    const secondPlace = final.final_winner === 'red' ? {
      name: final.competitor_blue,
      academy: final.academy_blue
    } : {
      name: final.competitor_red,
      academy: final.academy_red
    };

    // Terceros lugares: perdedores de semifinales
    const thirdPlaces = semifinals.map(sf => {
      const loser = sf.final_winner === 'red' ? {
        name: sf.competitor_blue,
        academy: sf.academy_blue
      } : {
        name: sf.competitor_red,
        academy: sf.academy_red
      };
      return loser;
    });

    return {
      first_place: firstPlace.name,
      first_place_academy: firstPlace.academy,
      second_place: secondPlace.name,
      second_place_academy: secondPlace.academy,
      third_place_1: thirdPlaces[0].name,
      third_place_1_academy: thirdPlaces[0].academy,
      third_place_2: thirdPlaces[1].name,
      third_place_2_academy: thirdPlaces[1].academy
    };
  }

  // Generar podio para bracket de eliminación directa genérico
  static generatePodiumForElimination(fights) {
    // Buscar la pelea final (última en orden)
    const sortedFights = [...fights].sort((a, b) => b.order_index - a.order_index);
    const final = sortedFights[0];

    if (!final || !final.final_winner) {
      throw new Error('No se puede determinar la final');
    }

    const firstPlace = final.final_winner === 'red' ? {
      name: final.competitor_red,
      academy: final.academy_red
    } : {
      name: final.competitor_blue,
      academy: final.academy_blue
    };

    const secondPlace = final.final_winner === 'red' ? {
      name: final.competitor_blue,
      academy: final.academy_blue
    } : {
      name: final.competitor_red,
      academy: final.academy_red
    };

    // Para terceros lugares, buscar las semifinales (penúltimas peleas)
    const semifinals = sortedFights.slice(1, 3);
    const thirdPlaces = semifinals
      .filter(sf => sf.final_winner)
      .map(sf => {
        const loser = sf.final_winner === 'red' ? {
          name: sf.competitor_blue,
          academy: sf.academy_blue
        } : {
          name: sf.competitor_red,
          academy: sf.academy_red
        };
        return loser;
      });

    return {
      first_place: firstPlace.name,
      first_place_academy: firstPlace.academy,
      second_place: secondPlace.name,
      second_place_academy: secondPlace.academy,
      third_place_1: thirdPlaces[0]?.name || null,
      third_place_1_academy: thirdPlaces[0]?.academy || null,
      third_place_2: thirdPlaces[1]?.name || null,
      third_place_2_academy: thirdPlaces[1]?.academy || null
    };
  }

  // Guardar podio en base de datos
  static savePodium(tournamentId, podium) {
    // Verificar si ya existe
    const existing = db.prepare('SELECT id FROM podiums WHERE tournament_id = ?').get(tournamentId);

    if (existing) {
      // Actualizar
      const stmt = db.prepare(`
        UPDATE podiums 
        SET first_place = ?, first_place_academy = ?,
            second_place = ?, second_place_academy = ?,
            third_place_1 = ?, third_place_1_academy = ?,
            third_place_2 = ?, third_place_2_academy = ?,
            generated_at = CURRENT_TIMESTAMP
        WHERE tournament_id = ?
      `);

      stmt.run(
        podium.first_place, podium.first_place_academy,
        podium.second_place, podium.second_place_academy,
        podium.third_place_1, podium.third_place_1_academy,
        podium.third_place_2, podium.third_place_2_academy,
        tournamentId
      );
    } else {
      // Insertar
      const stmt = db.prepare(`
        INSERT INTO podiums (
          tournament_id, first_place, first_place_academy,
          second_place, second_place_academy,
          third_place_1, third_place_1_academy,
          third_place_2, third_place_2_academy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        tournamentId,
        podium.first_place, podium.first_place_academy,
        podium.second_place, podium.second_place_academy,
        podium.third_place_1, podium.third_place_1_academy,
        podium.third_place_2, podium.third_place_2_academy
      );
    }

    return this.getPodium(tournamentId);
  }

  // Obtener podio de un torneo
  static getPodium(tournamentId) {
    const stmt = db.prepare('SELECT * FROM podiums WHERE tournament_id = ?');
    return stmt.get(tournamentId);
  }

  // Obtener todos los podios
  static getAllPodiums() {
    const stmt = db.prepare(`
      SELECT p.*, t.name as tournament_name, t.category, t.division, t.weight_class
      FROM podiums p
      JOIN tournaments t ON p.tournament_id = t.id
      ORDER BY p.generated_at DESC
    `);
    return stmt.all();
  }

  // Recalcular podio (si se edita un resultado)
  static recalculatePodium(tournamentId) {
    // Verificar si todas las peleas siguen completadas
    const allCompleted = Fight.allCompleted(tournamentId);
    if (!allCompleted) {
      // Eliminar podio si ya no están todas las peleas completadas
      db.prepare('DELETE FROM podiums WHERE tournament_id = ?').run(tournamentId);
      return null;
    }

    return this.generatePodium(tournamentId);
  }
}
