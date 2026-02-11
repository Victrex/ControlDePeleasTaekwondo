import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';

export default function Awards() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [brackets, setBrackets] = useState([]);
  const [bracketsData, setBracketsData] = useState({}); // { bracketId: { matches, competitors, awarded } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (selectedTournament) {
      loadBrackets(selectedTournament.id);
    }
  }, [selectedTournament]);

  const loadTournaments = async () => {
    try {
      const data = await api.getTournaments();
      setTournaments(data);
      if (data.length > 0) {
        setSelectedTournament(data[0]);
      }
    } catch (error) {
      console.error('Error cargando torneos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBrackets = async (tournamentId) => {
    try {
      const data = await api.getBracketsByTournament(tournamentId);
      setBrackets(data || []);
      
      // Cargar datos de cada bracket
      const bracketsInfo = {};
      for (const bracket of (data || [])) {
        const matches = await api.getBracketMatches(bracket.id);
        const competitors = await api.getBracketCompetitors(bracket.id);
        
        // Calcular podio
        const podium = calculatePodium(matches, competitors, bracket);
        
        // Leer estado de premiación del localStorage
        const awardedKey = `bracket_awarded_${bracket.id}`;
        const awarded = localStorage.getItem(awardedKey) === 'true';
        
        bracketsInfo[bracket.id] = {
          matches,
          competitors,
          podium,
          awarded
        };
      }
      setBracketsData(bracketsInfo);
    } catch (error) {
      console.error('Error cargando brackets:', error);
    }
  };

  const calculatePodium = (matches, competitors, bracket) => {
    if (!matches || matches.length === 0) {
      return { status: 'no_matches', first: null, second: null, third: [] };
    }

    // Encontrar la ronda máxima (final)
    const maxRound = Math.max(...matches.map(m => m.round));
    const finalMatch = matches.find(m => m.round === maxRound);
    
    if (!finalMatch) {
      return { status: 'no_final', first: null, second: null, third: [] };
    }

    // Si la final no tiene ganador, está pendiente
    if (!finalMatch.winner_id) {
      return { status: 'pending', first: null, second: null, third: [] };
    }

    // Primer lugar: ganador de la final
    const firstPlace = competitors.find(c => c.id === finalMatch.winner_id);
    
    // Segundo lugar: perdedor de la final
    const secondPlaceId = finalMatch.competitor1_id === finalMatch.winner_id 
      ? finalMatch.competitor2_id 
      : finalMatch.competitor1_id;
    const secondPlace = competitors.find(c => c.id === secondPlaceId);

    // Tercer lugar: perdedores de las semifinales
    const thirdPlaces = [];
    if (maxRound >= 2) {
      const semiFinals = matches.filter(m => m.round === maxRound - 1);
      for (const semi of semiFinals) {
        if (semi.winner_id) {
          const loserId = semi.competitor1_id === semi.winner_id 
            ? semi.competitor2_id 
            : semi.competitor1_id;
          const loser = competitors.find(c => c.id === loserId);
          if (loser) {
            thirdPlaces.push(loser);
          }
        }
      }
    }

    return {
      status: 'completed',
      first: firstPlace,
      second: secondPlace,
      third: thirdPlaces
    };
  };

  const toggleAwarded = (bracketId) => {
    const awardedKey = `bracket_awarded_${bracketId}`;
    const currentValue = bracketsData[bracketId]?.awarded || false;
    const newValue = !currentValue;
    
    localStorage.setItem(awardedKey, newValue.toString());
    
    setBracketsData(prev => ({
      ...prev,
      [bracketId]: {
        ...prev[bracketId],
        awarded: newValue
      }
    }));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="awards-page">
      <header className="dashboard-header">
        <h1>🏆 Premiación</h1>
        <div className="header-info">
          <button onClick={() => navigate('/admin')} className="btn-back">
            ← Volver al Dashboard
          </button>
          <span className="user-info">👤 {user?.username}</span>
          <button onClick={handleLogout} className="btn-logout">Cerrar Sesión</button>
        </div>
      </header>

      <div className="awards-content">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h3>Torneos</h3>
          </div>
          
          <ul className="tournament-list">
            {tournaments.map(t => (
              <li 
                key={t.id}
                className={selectedTournament?.id === t.id ? 'active' : ''}
                onClick={() => setSelectedTournament(t)}
              >
                <span className="tournament-name">{t.name}</span>
                <span className={`status-badge ${t.status}`}>{t.status}</span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="awards-main">
          {selectedTournament ? (
            <>
              <div className="awards-header">
                <h2>{selectedTournament.name}</h2>
                <div className="tournament-meta">
                  {selectedTournament.category && <span>{selectedTournament.category}</span>}
                  {selectedTournament.division && <span>{selectedTournament.division}</span>}
                  {selectedTournament.weight_class && <span>{selectedTournament.weight_class}</span>}
                </div>
              </div>

              {brackets.length === 0 ? (
                <div className="empty-state">
                  <p>No hay llaves creadas para este torneo</p>
                </div>
              ) : (
                <div className="brackets-awards-list">
                  {brackets.map(bracket => {
                    const data = bracketsData[bracket.id] || {};
                    const { podium, awarded } = data;
                    
                    return (
                      <div key={bracket.id} className={`bracket-award-card ${awarded ? 'awarded' : ''}`}>
                        <div className="bracket-award-header">
                          <h3>{bracket.name}</h3>
                          <label className="awarded-checkbox">
                            <input 
                              type="checkbox" 
                              checked={awarded || false}
                              onChange={() => toggleAwarded(bracket.id)}
                            />
                            <span className="checkmark"></span>
                            <span className="label-text">{awarded ? '✓ Premiado' : 'Marcar como premiado'}</span>
                          </label>
                        </div>

                        <div className="podium-display">
                          {!podium || podium.status === 'no_matches' ? (
                            <div className="podium-pending">
                              <span className="pending-icon">⏳</span>
                              <span>Sin competencias registradas</span>
                            </div>
                          ) : podium.status === 'pending' ? (
                            <div className="podium-pending">
                              <span className="pending-icon">⏳</span>
                              <span>Por disputarse</span>
                            </div>
                          ) : (
                            <div className="podium-places">
                              {/* Primer Lugar */}
                              <div className="podium-place first">
                                <div className="place-medal">🥇</div>
                                <div className="place-label">1er Lugar</div>
                                <div className="place-name">{podium.first?.name || 'Por definir'}</div>
                                {podium.first?.academy && (
                                  <div className="place-academy">{podium.first.academy}</div>
                                )}
                              </div>

                              {/* Segundo Lugar */}
                              <div className="podium-place second">
                                <div className="place-medal">🥈</div>
                                <div className="place-label">2do Lugar</div>
                                <div className="place-name">{podium.second?.name || 'Por definir'}</div>
                                {podium.second?.academy && (
                                  <div className="place-academy">{podium.second.academy}</div>
                                )}
                              </div>

                              {/* Tercer Lugar(es) */}
                              {podium.third && podium.third.length > 0 && (
                                <div className="podium-place third">
                                  <div className="place-medal">🥉</div>
                                  <div className="place-label">3er Lugar{podium.third.length > 1 ? 'es' : ''}</div>
                                  {podium.third.map((competitor, idx) => (
                                    <div key={idx} className="third-place-entry">
                                      <div className="place-name">{competitor.name}</div>
                                      {competitor.academy && (
                                        <div className="place-academy">{competitor.academy}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>Selecciona un torneo</h2>
              <p>Elige un torneo de la lista para ver las premiaciones</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
