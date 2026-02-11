import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function BracketManager({ tournamentId, initialBracketId, onFightsCreated }) {
  const [brackets, setBrackets] = useState([]);
  const [selectedBracket, setSelectedBracket] = useState(null);
  const [competitors, setCompetitors] = useState([]);
  const [matches, setMatches] = useState([]);
  const [newCompetitors, setNewCompetitors] = useState([{ name: '', academy: '' }]);
  const [confirmWinner, setConfirmWinner] = useState(null); // { matchId, competitorId, competitorName }

  useEffect(() => {
    if (tournamentId) loadBrackets();
  }, [tournamentId, initialBracketId]);

  useEffect(() => {
    if (selectedBracket) {
      loadCompetitors(selectedBracket.id);
      loadMatches(selectedBracket.id);
    }
  }, [selectedBracket]);

  const loadBrackets = async () => {
    try {
      const res = await api.getBracketsByTournament(tournamentId);
      setBrackets(res || []);
      if (initialBracketId) {
        const found = res.find(b => b.id === initialBracketId);
        if (found) {
          setSelectedBracket(found);
          return;
        }
      }
      if (res && res.length > 0) setSelectedBracket(res[0]);
    } catch (error) {
      console.error('Error loading brackets:', error);
      setBrackets([]);
    }
  };

  const loadCompetitors = async (bracketId) => {
    try {
      const res = await api.getBracketCompetitors(bracketId);
      setCompetitors(res || []);
    } catch (error) {
      console.error('Error loading competitors:', error);
      setCompetitors([]);
    }
  };

  const loadMatches = async (bracketId) => {
    try {
      const res = await api.getBracketMatches(bracketId);
      setMatches(res || []);
    } catch (error) {
      console.error('Error loading matches:', error);
      setMatches([]);
    }
  };

  const handleAddCompetitors = async (e) => {
    e.preventDefault();
    for (let i = 0; i < newCompetitors.length; i++) {
      const color = i % 2 === 0 ? 'blue' : 'red';
      await api.addBracketCompetitor({ 
        bracket_id: selectedBracket.id, 
        ...newCompetitors[i], 
        peto_color: color,
        seed: competitors.length + i + 1
      });
    }
    setNewCompetitors([{ name: '', academy: '' }]);
    loadCompetitors(selectedBracket.id);
  };

  const handleGenerateBracket = async () => {
    if (competitors.length < 2) {
      alert('Se necesitan al menos 2 competidores');
      return;
    }
    await api.generateBracketStructure(selectedBracket.id);
    loadMatches(selectedBracket.id);
    if (onFightsCreated) {
      onFightsCreated();
    }
  };

  const handleCompetitorChange = (idx, field, value) => {
    const updated = [...newCompetitors];
    updated[idx][field] = value;
    setNewCompetitors(updated);
  };

  const handleAddCompetitorField = () => {
    setNewCompetitors([...newCompetitors, { name: '', academy: '' }]);
  };

  // Agrupar matches por ronda
  const matchesByRound = matches.reduce((acc, m) => {
    if (!acc[m.round]) acc[m.round] = [];
    acc[m.round].push(m);
    return acc;
  }, {});

  const getRoundName = (round, totalRounds) => {
    if (round === totalRounds) return 'FINAL';
    if (round === totalRounds - 1 && totalRounds > 1) return 'SEMIFINAL';
    if (round === totalRounds - 2 && totalRounds > 2) return 'CUARTOS';
    if (round === totalRounds - 3 && totalRounds > 3) return 'OCTAVOS';
    return `RONDA ${round}`;
  };

  const totalRounds = Math.max(...matches.map(m => m.round), 0);

  // Generar simulación de bracket basado en el número de competidores
  const generateSimulatedBracket = () => {
    const numCompetitors = competitors.length;
    if (numCompetitors < 2) return null;

    // Calcular el número de rondas necesarias
    const numRounds = Math.ceil(Math.log2(numCompetitors));
    const totalSlots = Math.pow(2, numRounds);
    
    const rounds = [];
    let matchesInRound = totalSlots / 2;
    
    for (let round = 1; round <= numRounds; round++) {
      const roundMatches = [];
      for (let i = 0; i < matchesInRound; i++) {
        if (round === 1) {
          // Primera ronda: asignar competidores
          const comp1Idx = i * 2;
          const comp2Idx = i * 2 + 1;
          roundMatches.push({
            id: `sim-${round}-${i}`,
            competitor1_name: competitors[comp1Idx]?.name || null,
            competitor2_name: competitors[comp2Idx]?.name || null,
            competitor1_id: competitors[comp1Idx]?.id || null,
            competitor2_id: competitors[comp2Idx]?.id || null,
            round,
            status: 'pending'
          });
        } else {
          // Rondas siguientes: por definir
          roundMatches.push({
            id: `sim-${round}-${i}`,
            competitor1_name: null,
            competitor2_name: null,
            round,
            status: 'pending'
          });
        }
      }
      rounds.push({ round, matches: roundMatches });
      matchesInRound = matchesInRound / 2;
    }
    
    return rounds;
  };

  // Función para manejar clic en un competidor para asignarlo como ganador
  const handleClickCompetitor = (match, competitorId, competitorName) => {
    // Solo permitir si hay ambos competidores y no hay ganador aún
    if (!match.competitor1_id || !match.competitor2_id) return;
    if (match.winner_id) return;
    if (match.id.toString().startsWith('sim-')) return; // No permitir en simulados
    
    setConfirmWinner({ 
      matchId: match.id, 
      competitorId, 
      competitorName 
    });
  };

  // Confirmar y asignar ganador
  const handleConfirmWinner = async () => {
    if (!confirmWinner) return;
    
    try {
      await api.setMatchWinner(confirmWinner.matchId, { 
        winner_id: confirmWinner.competitorId 
      });
      loadMatches(selectedBracket.id);
      if (onFightsCreated) {
        onFightsCreated(); // Refrescar peleas también
      }
      setConfirmWinner(null);
    } catch (error) {
      console.error('Error setting winner:', error);
      alert('Error al asignar ganador: ' + (error.response?.data?.error || error.message));
    }
  };

  // Calcular la altura de cada match según la ronda para alinear conectores
  const getMatchSpacing = (roundIndex, totalRoundsCount) => {
    // Cada ronda subsiguiente tiene el doble de espacio
    const baseSpacing = 80; // altura base del match
    const multiplier = Math.pow(2, roundIndex);
    return baseSpacing * multiplier;
  };

  // Renderizar el bracket (real o simulado)
  const renderBracket = () => {
    let roundsData = [];
    let isSimulated = false;

    if (matches.length > 0) {
      // Usar matches reales
      roundsData = Object.keys(matchesByRound).sort((a, b) => a - b).map(round => ({
        round: parseInt(round),
        matches: matchesByRound[round]
      }));
    } else if (competitors.length >= 2) {
      // Mostrar simulación
      roundsData = generateSimulatedBracket();
      isSimulated = true;
      if (!roundsData) return null;
    } else {
      return null;
    }

    const numRounds = roundsData.length;

    return roundsData.map((roundData, roundIdx) => {
      const isLastRound = roundIdx === numRounds - 1;
      const matchSpacing = getMatchSpacing(roundIdx, numRounds);
      
      return (
        <React.Fragment key={roundData.round}>
          <div className={`bracket-round ${isLastRound ? 'final-round' : ''}`}>
            <div className="round-header">
              {getRoundName(roundData.round, numRounds)}
            </div>
            <div 
              className="round-matches"
              style={{ 
                gap: `${Math.max(8, matchSpacing - 70)}px`,
                paddingTop: roundIdx > 0 ? `${(matchSpacing - 70) / 2}px` : '0'
              }}
            >
              {roundData.matches.map((match, idx) => {
                const winnerId = match.winner_id ? Number(match.winner_id) : null;
                const comp1Id = match.competitor1_id ? Number(match.competitor1_id) : null;
                const comp2Id = match.competitor2_id ? Number(match.competitor2_id) : null;
                const isComp1Winner = winnerId && comp1Id && winnerId === comp1Id;
                const isComp2Winner = winnerId && comp2Id && winnerId === comp2Id;
                
                // Detectar si es un match con BYE (un competidor ya está, el otro viene de ronda anterior)
                const hasBye = (match.competitor1_id && !match.competitor2_id) || (!match.competitor1_id && match.competitor2_id);
                const byeCompetitorName = hasBye ? (match.competitor1_name || match.competitor2_name) : null;
                
                // Texto a mostrar para cada competidor
                const comp1Display = match.competitor1_name || (hasBye && match.competitor2_name ? <em className="waiting-opponent">Ganador anterior</em> : <em>Por definir</em>);
                const comp2Display = match.competitor2_name || (hasBye && match.competitor1_name ? <em className="waiting-opponent">Ganador anterior</em> : <em>Por definir</em>);
                
                // Determinar si el match es clickeable (ambos competidores presentes y sin ganador)
                const isClickable = !isSimulated && match.competitor1_id && match.competitor2_id && !match.winner_id;
                
                return (
                <div 
                  key={match.id} 
                  className={`match-wrapper ${isSimulated ? 'simulated' : ''} ${hasBye ? 'has-bye' : ''}`}
                  style={{ minHeight: `${Math.max(70, matchSpacing - 10)}px` }}
                >
                  <div className={`match-card ${match.status || 'pending'} ${isLastRound ? 'final-match' : ''}`}>
                    <div 
                      className={`match-player top ${isComp1Winner ? 'winner' : ''} ${!match.competitor1_id && hasBye ? 'bye-slot' : ''} ${isClickable ? 'clickable' : ''}`}
                      onClick={() => isClickable && handleClickCompetitor(match, match.competitor1_id, match.competitor1_name)}
                      title={isClickable ? `Clic para declarar ganador a ${match.competitor1_name}` : ''}
                    >
                      <span className="player-seed">{match.competitor1_name ? '●' : '○'}</span>
                      <span className="player-name">
                        {comp1Display}
                      </span>
                      {isComp1Winner && <span className="winner-badge">✓</span>}
                      {hasBye && match.competitor1_name && <span className="bye-badge">BYE</span>}
                    </div>
                    <div className="match-vs">VS</div>
                    <div 
                      className={`match-player bottom ${isComp2Winner ? 'winner' : ''} ${!match.competitor2_id && hasBye ? 'bye-slot' : ''} ${isClickable ? 'clickable' : ''}`}
                      onClick={() => isClickable && handleClickCompetitor(match, match.competitor2_id, match.competitor2_name)}
                      title={isClickable ? `Clic para declarar ganador a ${match.competitor2_name}` : ''}
                    >
                      <span className="player-seed">{match.competitor2_name ? '●' : '○'}</span>
                      <span className="player-name">
                        {comp2Display}
                      </span>
                      {isComp2Winner && <span className="winner-badge">✓</span>}
                      {hasBye && match.competitor2_name && <span className="bye-badge">BYE</span>}
                    </div>
                    {/* Mostrar ganador de la pelea */}
                    {match.winner_name && (
                      <div className="match-winner-label">
                        🏆 {match.winner_name}
                      </div>
                    )}
                  </div>
                  {/* Conector derecho */}
                  {!isLastRound && (
                    <svg className="connector-svg" width="40" height="100%" style={{ position: 'absolute', right: '-40px', top: 0, height: '100%' }}>
                      <line x1="0" y1="50%" x2="20" y2="50%" stroke="#64748b" strokeWidth="2"/>
                      {idx % 2 === 0 ? (
                        <line x1="20" y1="50%" x2="20" y2="100%" stroke="#64748b" strokeWidth="2"/>
                      ) : (
                        <line x1="20" y1="0" x2="20" y2="50%" stroke="#64748b" strokeWidth="2"/>
                      )}
                      {idx % 2 === 1 && (
                        <line x1="20" y1="50%" x2="40" y2="50%" stroke="#64748b" strokeWidth="2"/>
                      )}
                    </svg>
                  )}
                </div>
              );
              })}
            </div>
          </div>
          {/* Espacio entre rondas */}
          {!isLastRound && <div className="round-spacer"></div>}
        </React.Fragment>
      );
    });
  };

  // Obtener el campeón si existe
  const champion = matches.length > 0 && matchesByRound[totalRounds]?.[0]?.winner_id
    ? matchesByRound[totalRounds][0]
    : null;

  return (
    <div className="bracket-manager">
      {brackets.length > 0 && (
        <div className="bracket-tabs">
          {brackets.map(b => (
            <button
              key={b.id}
              className={`bracket-tab ${selectedBracket?.id === b.id ? 'active' : ''}`}
              onClick={() => setSelectedBracket(b)}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {selectedBracket && (
        <div className="bracket-content">
          {/* Formulario para agregar competidores */}
          <div className="add-competitors-section">
            <h4>➕ Agregar Competidores</h4>
            <form onSubmit={handleAddCompetitors} className="compact-form">
              {newCompetitors.map((comp, idx) => (
                <div key={idx} className="competitor-input-row">
                  <input
                    type="text"
                    value={comp.name}
                    onChange={e => handleCompetitorChange(idx, 'name', e.target.value)}
                    placeholder={`Nombre del competidor`}
                    required
                  />
                  <input
                    type="text"
                    value={comp.academy}
                    onChange={e => handleCompetitorChange(idx, 'academy', e.target.value)}
                    placeholder="Academia"
                  />
                  {newCompetitors.length > 1 && (
                    <button type="button" className="btn-remove" onClick={() => {
                      setNewCompetitors(newCompetitors.filter((_, i) => i !== idx));
                    }}>×</button>
                  )}
                </div>
              ))}
              <div className="form-actions">
                <button type="button" onClick={handleAddCompetitorField} className="btn-small">+ Añadir otro</button>
                <button type="submit" className="btn-small btn-primary">Guardar</button>
              </div>
            </form>
          </div>

          {/* Lista de competidores */}
          <div className="competitors-list-compact">
            <h4>👥 Competidores ({competitors.length})</h4>
            {competitors.length > 0 ? (
              <div className="competitors-chips">
                {competitors.map((c, idx) => (
                  <span key={c.id} className="competitor-chip">
                    <span className="chip-number">{idx + 1}</span>
                    {c.name}
                    {c.academy && <small>({c.academy})</small>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="no-competitors">No hay competidores agregados</p>
            )}
            {competitors.length >= 2 && matches.length === 0 && (
              <button onClick={handleGenerateBracket} className="btn-primary btn-generate">
                🎯 Generar Bracket Oficial
              </button>
            )}
          </div>

          {/* Visualización del Bracket */}
          {(matches.length > 0 || competitors.length >= 2) && (
            <div className="tournament-bracket">
              <h4>
                {matches.length > 0 ? '🏆 Bracket del Torneo' : '📋 Vista Previa del Bracket'}
                {matches.length === 0 && <span className="preview-badge">SIMULACIÓN</span>}
              </h4>
              <div className="bracket-scroll-container">
                <div className="bracket-container">
                  {renderBracket()}
                  
                  {/* Columna del Campeón */}
                  {champion && (
                    <>
                      <div className="round-spacer"></div>
                      <div className="bracket-round champion-round">
                        <div className="round-header champion-header">🏆 CAMPEÓN/A</div>
                        <div className="round-matches champion-matches">
                          <div className="champion-card">
                            <div className="champion-trophy">🥇</div>
                            <div className="champion-name">{champion.winner_name}</div>
                            <div className="champion-label">CAMPEÓN/A DE LA LLAVE</div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mensaje cuando no hay competidores */}
          {competitors.length < 2 && matches.length === 0 && (
            <div className="empty-bracket-message">
              <div className="empty-icon">🥋</div>
              <h4>Configura tu Bracket</h4>
              <p>Agrega al menos 2 competidores para visualizar el bracket del torneo.</p>
            </div>
          )}
        </div>
      )}

      {!selectedBracket && brackets.length === 0 && (
        <div className="no-brackets-message">
          <p>No hay llaves disponibles para este torneo.</p>
        </div>
      )}

      {/* Modal de confirmación de ganador */}
      {confirmWinner && (
        <div className="confirm-winner-overlay" onClick={() => setConfirmWinner(null)}>
          <div className="confirm-winner-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-winner-icon">🏆</div>
            <h3>Confirmar Ganador</h3>
            <p>¿Deseas declarar a <strong>{confirmWinner.competitorName}</strong> como ganador de esta pelea?</p>
            <div className="confirm-winner-actions">
              <button className="btn-cancel" onClick={() => setConfirmWinner(null)}>
                Cancelar
              </button>
              <button className="btn-confirm" onClick={handleConfirmWinner}>
                ✓ Confirmar Ganador
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .bracket-manager {
          padding: 0.75rem;
        }
        
        .bracket-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
          flex-wrap: wrap;
        }
        
        .bracket-tab {
          padding: 0.5rem 1rem;
          border: 2px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .bracket-tab:hover {
          border-color: #667eea;
          background: #f0f4ff;
        }
        
        .bracket-tab.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border-color: transparent;
        }
        
        .bracket-content {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        
        .add-competitors-section {
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          padding: 1rem;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        
        .add-competitors-section h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.95rem;
          color: #334155;
        }
        
        .compact-form {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .competitor-input-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        
        .competitor-input-row input {
          padding: 0.5rem 0.75rem;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.85rem;
          flex: 1;
          transition: border-color 0.2s;
        }
        
        .competitor-input-row input:focus {
          outline: none;
          border-color: #667eea;
        }
        
        .btn-remove {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
          flex-shrink: 0;
        }
        
        .btn-remove:hover {
          transform: scale(1.1);
        }
        
        .form-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        
        .btn-small {
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          border-radius: 8px;
          border: 2px solid #e2e8f0;
          background: #fff;
          color: #475569;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .btn-small:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        
        .btn-small.btn-primary {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
        }
        
        .btn-small.btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .competitors-list-compact {
          background: #fff;
          padding: 1rem;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        
        .competitors-list-compact h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.95rem;
          color: #334155;
        }
        
        .competitors-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        
        .competitor-chip {
          background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
          padding: 0.4rem 0.75rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
          color: #3730a3;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        
        .chip-number {
          background: #4f46e5;
          color: white;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
        }
        
        .competitor-chip small {
          color: #6366f1;
          font-weight: 400;
        }
        
        .no-competitors {
          color: #94a3b8;
          font-size: 0.85rem;
          margin: 0;
        }
        
        .btn-generate {
          margin-top: 1rem;
          padding: 0.75rem 1.5rem;
          font-size: 0.9rem;
          width: 100%;
        }
        
        /* ========================================
           BRACKET VISUALIZATION
           ======================================== */
        
        .tournament-bracket {
          background: linear-gradient(135deg, #1e293b, #0f172a);
          padding: 1.5rem;
          border-radius: 16px;
        }
        
        .tournament-bracket h4 {
          margin: 0 0 1.5rem 0;
          font-size: 1.1rem;
          color: #f1f5f9;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
        }
        
        .preview-badge {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 1px;
        }
        
        .bracket-scroll-container {
          overflow-x: auto;
          padding-bottom: 1rem;
        }
        
        .bracket-container {
          display: flex;
          align-items: flex-start;
          min-width: max-content;
          padding: 1rem 0;
        }
        
        .bracket-round {
          display: flex;
          flex-direction: column;
          min-width: 180px;
        }
        
        .round-header {
          text-align: center;
          font-weight: 700;
          font-size: 0.75rem;
          padding: 0.6rem 1rem;
          background: linear-gradient(135deg, #475569, #334155);
          color: #f1f5f9;
          border-radius: 8px;
          margin-bottom: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }
        
        .champion-header {
          background: linear-gradient(135deg, #f59e0b, #d97706) !important;
        }
        
        .round-matches {
          display: flex;
          flex-direction: column;
          justify-content: space-around;
          flex: 1;
        }
        
        .round-spacer {
          width: 50px;
          min-width: 50px;
        }
        
        .match-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }
        
        .match-wrapper.simulated .match-card {
          opacity: 0.85;
          border-style: dashed;
        }
        
        .match-card {
          background: #fff;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          border: 2px solid #e2e8f0;
          width: 170px;
          flex-shrink: 0;
        }
        
        .match-card.completed {
          border-color: #22c55e;
        }
        
        .match-card.final-match {
          border-width: 3px;
          border-color: #f59e0b;
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
        }
        
        .match-player {
          padding: 0.6rem 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #fff;
          transition: all 0.3s ease;
        }
        
        .match-player.top {
          border-bottom: 1px solid #f1f5f9;
        }
        
        .match-player.winner {
          background: linear-gradient(135deg, #dcfce7, #bbf7d0);
        }
        
        .match-player.winner .player-name {
          color: #166534;
          font-weight: 700;
        }
        
        .player-seed {
          color: #94a3b8;
          font-size: 0.7rem;
        }
        
        .match-player.winner .player-seed {
          color: #22c55e;
        }
        
        .player-name {
          flex: 1;
          font-size: 0.8rem;
          font-weight: 600;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .player-name em {
          color: #94a3b8;
          font-weight: 400;
        }
        
        .winner-badge {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: bold;
          flex-shrink: 0;
        }
        
        .match-winner-label {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
          text-align: center;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .bye-badge {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-size: 0.6rem;
          font-weight: 700;
          margin-left: 0.25rem;
          flex-shrink: 0;
        }
        
        .bye-slot {
          background: rgba(245, 158, 11, 0.1);
          border-left: 3px solid #f59e0b;
        }
        
        .waiting-opponent {
          color: #f59e0b;
          font-style: italic;
        }
        
        .match-vs {
          background: #f1f5f9;
          text-align: center;
          font-size: 0.65rem;
          font-weight: 700;
          color: #64748b;
          padding: 0.15rem;
        }
        
        /* Conectores SVG */
        .connector-svg {
          pointer-events: none;
        }
        
        /* Champion Card */
        .champion-round {
          min-width: 160px;
        }
        
        .champion-matches {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
        }
        
        .champion-card {
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border-radius: 16px;
          padding: 1.5rem 1rem;
          text-align: center;
          border: 3px solid #f59e0b;
          box-shadow: 0 8px 30px rgba(245, 158, 11, 0.4);
          animation: championPulse 2s ease-in-out infinite;
        }
        
        @keyframes championPulse {
          0%, 100% { box-shadow: 0 8px 30px rgba(245, 158, 11, 0.4); }
          50% { box-shadow: 0 8px 40px rgba(245, 158, 11, 0.6); }
        }
        
        .champion-trophy {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }
        
        .champion-name {
          font-size: 1rem;
          font-weight: 800;
          color: #92400e;
          margin-bottom: 0.25rem;
        }
        
        .champion-label {
          font-size: 0.65rem;
          font-weight: 600;
          color: #b45309;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        /* Empty states */
        .empty-bracket-message {
          text-align: center;
          padding: 3rem 2rem;
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          border-radius: 16px;
          border: 2px dashed #cbd5e1;
        }
        
        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .empty-bracket-message h4 {
          margin: 0 0 0.5rem 0;
          color: #334155;
        }
        
        .empty-bracket-message p {
          margin: 0;
          color: #64748b;
          font-size: 0.9rem;
        }
        
        .no-brackets-message {
          text-align: center;
          padding: 2rem;
          color: #64748b;
        }
        
        /* ========================================
           RESPONSIVE
           ======================================== */
        
        @media (max-width: 768px) {
          .bracket-manager {
            padding: 0.5rem;
          }
          
          .bracket-tab {
            padding: 0.4rem 0.75rem;
            font-size: 0.8rem;
          }
          
          .add-competitors-section,
          .competitors-list-compact {
            padding: 0.75rem;
          }
          
          .competitor-input-row {
            flex-direction: column;
          }
          
          .competitor-input-row input {
            width: 100%;
          }
          
          .btn-remove {
            width: 100%;
            border-radius: 8px;
            height: 36px;
          }
          
          .form-actions {
            flex-direction: column;
          }
          
          .form-actions button {
            width: 100%;
          }
          
          .tournament-bracket {
            padding: 1rem;
          }
          
          .bracket-round {
            min-width: 150px;
          }
          
          .match-card {
            width: 145px;
          }
          
          .round-header {
            font-size: 0.65rem;
            padding: 0.5rem 0.75rem;
          }
          
          .match-player {
            padding: 0.5rem;
          }
          
          .player-name {
            font-size: 0.75rem;
          }
          
          .round-spacer {
            width: 30px;
            min-width: 30px;
          }
        }
        
        @media (max-width: 480px) {
          .bracket-round {
            min-width: 130px;
          }
          
          .match-card {
            width: 125px;
          }
          
          .player-name {
            font-size: 0.7rem;
          }
          
          .round-header {
            font-size: 0.6rem;
            letter-spacing: 0.5px;
          }
          
          .champion-card {
            padding: 1rem 0.75rem;
          }
          
          .champion-trophy {
            font-size: 2rem;
          }
          
          .champion-name {
            font-size: 0.9rem;
          }
          
          .round-spacer {
            width: 20px;
            min-width: 20px;
          }
        }
        
        /* Estilos para competidores clickeables */
        .match-player.clickable {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .match-player.clickable:hover {
          background: linear-gradient(135deg, #22c55e, #16a34a) !important;
          color: white;
          transform: scale(1.02);
          box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
        }
        
        .match-player.clickable:hover .player-seed {
          color: white;
        }
        
        .match-player.clickable:hover .player-name {
          color: white;
        }
        
        /* Modal de confirmación de ganador */
        .confirm-winner-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          backdrop-filter: blur(4px);
        }
        
        .confirm-winner-modal {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          max-width: 400px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          animation: modalSlideIn 0.3s ease;
        }
        
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .confirm-winner-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .confirm-winner-modal h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          color: #1e293b;
        }
        
        .confirm-winner-modal p {
          margin: 0 0 1.5rem 0;
          color: #64748b;
          font-size: 1rem;
          line-height: 1.5;
        }
        
        .confirm-winner-modal strong {
          color: #1e293b;
          font-weight: 600;
        }
        
        .confirm-winner-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        
        .confirm-winner-actions button {
          padding: 0.75rem 1.5rem;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        
        .btn-cancel {
          background: #f1f5f9;
          color: #64748b;
        }
        
        .btn-cancel:hover {
          background: #e2e8f0;
        }
        
        .btn-confirm {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
        }
        
        .btn-confirm:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
        }
      `}</style>
    </div>
  );
}
