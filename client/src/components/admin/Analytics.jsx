import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import './Analytics.css';

// ─────────────────────────────────────────────────────────
// Sub-componentes de UI
// ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'blue', icon }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      {icon && <span className="stat-card__icon">{icon}</span>}
      <div className="stat-card__body">
        <div className="stat-card__value">{value ?? '—'}</div>
        <div className="stat-card__label">{label}</div>
        {sub && <div className="stat-card__sub">{sub}</div>}
      </div>
    </div>
  );
}

function WinBar({ wins, total }) {
  const pct = total > 0 ? Math.round((wins / total) * 100) : 0;
  return (
    <div className="win-bar">
      <div className="win-bar__fill" style={{ width: `${pct}%` }} />
      <span className="win-bar__label">{pct}%</span>
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="badge badge--gold">🥇 1°</span>;
  if (rank === 2) return <span className="badge badge--silver">🥈 2°</span>;
  if (rank === 3) return <span className="badge badge--bronze">🥉 3°</span>;
  return <span className="badge badge--plain">#{rank}</span>;
}

function SectionTitle({ children }) {
  return <h2 className="an-section-title">{children}</h2>;
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="an-tabs">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`an-tab${active === t.id ? ' an-tab--active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',    label: '🏠 Resumen' },
  { id: 'academies',   label: '🏫 Escuelas' },
  { id: 'competitors', label: '🥋 Competidores' },
  { id: 'tournaments', label: '🏆 Torneos' },
  { id: 'brackets',    label: '🔑 Llaves' },
  { id: 'scoring',     label: '⚡ Scoring' },
];

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [globalMetrics, setGlobalMetrics]       = useState(null);
  const [topStats, setTopStats]                 = useState(null);
  const [academyRanking, setAcademyRanking]     = useState(null);
  const [competitorRanking, setCompetitorRanking] = useState(null);
  const [tournamentMetrics, setTournamentMetrics] = useState(null);
  const [bracketMetrics, setBracketMetrics]         = useState(null);
  const [scoringMetrics, setScoringMetrics]         = useState(null);
  const [scoringCompetitors, setScoringCompetitors] = useState(null);

  // Tournament selector
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [tournamentsList, setTournamentsList]           = useState([]);

  // Detail modal
  const [detailType, setDetailType] = useState(null); // 'competitor' | 'academy'
  const [detailName, setDetailName] = useState('');
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search / filter
  const [competitorSearch, setCompetitorSearch] = useState('');
  const [academySearch, setAcademySearch]       = useState('');
  const [tournamentSearch, setTournamentSearch] = useState('');

  const [loading, setLoading]   = useState({});
  const [error, setError]       = useState({});

  // ── Loaders ──────────────────────────────────────────────
  const loadSection = useCallback(async (key, fetchFn) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    setError(prev => ({ ...prev, [key]: null }));
    try {
      const data = await fetchFn();
      return data;
    } catch (err) {
      setError(prev => ({ ...prev, [key]: err.message }));
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  // Load tournament list once on mount (for the selector dropdown — always unfiltered)
  useEffect(() => {
    api.getAnalyticsTournaments().then(d => d && setTournamentsList(d));
  }, []);

  // Reload all overview data whenever the selected tournament changes
  useEffect(() => {
    setGlobalMetrics(null); setTopStats(null);
    setAcademyRanking(null); setCompetitorRanking(null);
    setTournamentMetrics(null); setBracketMetrics(null);
    setScoringMetrics(null); setScoringCompetitors(null);
    loadSection('global', () => api.getAnalyticsGlobal(selectedTournamentId)).then(d => d && setGlobalMetrics(d));
    loadSection('top',    () => api.getAnalyticsTop(5, selectedTournamentId)).then(d => d && setTopStats(d));
  }, [selectedTournamentId, loadSection]);

  // Load per-tab data lazily (re-fires when data is cleared on tournament change)
  useEffect(() => {
    if (activeTab === 'academies' && !academyRanking) {
      loadSection('academies', () => api.getAnalyticsAcademies(selectedTournamentId)).then(d => d && setAcademyRanking(d));
    }
    if (activeTab === 'competitors' && !competitorRanking) {
      loadSection('competitors', () => api.getAnalyticsCompetitors(selectedTournamentId)).then(d => d && setCompetitorRanking(d));
    }
    if (activeTab === 'tournaments' && !tournamentMetrics) {
      loadSection('tournaments', () => api.getAnalyticsTournaments(selectedTournamentId)).then(d => d && setTournamentMetrics(d));
    }
    if (activeTab === 'brackets' && !bracketMetrics) {
      loadSection('brackets', () => api.getAnalyticsBrackets(selectedTournamentId)).then(d => d && setBracketMetrics(d));
    }
    if (activeTab === 'scoring' && !scoringMetrics) {
      loadSection('scoring', () => api.getAnalyticsScoring(selectedTournamentId)).then(d => d && setScoringMetrics(d));
      loadSection('scoringComp', () => api.getAnalyticsScoringCompetitors(selectedTournamentId)).then(d => d && setScoringCompetitors(d));
    }
  }, [activeTab, academyRanking, competitorRanking, tournamentMetrics, bracketMetrics, scoringMetrics, loadSection, selectedTournamentId]);

  // ── Detail modal ─────────────────────────────────────────
  const openDetail = async (type, name) => {
    setDetailType(type);
    setDetailName(name);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const data = type === 'competitor'
        ? await api.getAnalyticsCompetitorDetail(name)
        : await api.getAnalyticsAcademyDetail(name);
      setDetailData(data);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailType(null);
    setDetailName('');
    setDetailData(null);
  };

  // ── Victory type label ────────────────────────────────────
  const vtLabel = v =>
    ({ rounds: 'Por rondas', injury: 'Por lesión', abandon: 'Por abandono' }[v] || v || 'N/A');

  // ── Status label ─────────────────────────────────────────
  const statusLabel = s =>
    ({ active: 'Activo', completed: 'Completado', cancelled: 'Cancelado' }[s] || s);
  const statusClass = s =>
    ({ active: 'status--active', completed: 'status--completed', cancelled: 'status--cancelled' }[s] || '');

  // ── Filtered lists ───────────────────────────────────────
  const filteredAcademies = (academyRanking || []).filter(a =>
    a.academy?.toLowerCase().includes(academySearch.toLowerCase())
  );
  const filteredCompetitors = (competitorRanking || []).filter(c =>
    c.competitor?.toLowerCase().includes(competitorSearch.toLowerCase()) ||
    c.academy?.toLowerCase().includes(competitorSearch.toLowerCase())
  );
  const filteredTournaments = (tournamentMetrics || []).filter(t =>
    t.name?.toLowerCase().includes(tournamentSearch.toLowerCase()) ||
    t.category?.toLowerCase().includes(tournamentSearch.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────
  // RENDER TABS
  // ─────────────────────────────────────────────────────────

  const renderOverview = () => {
    const g = globalMetrics;
    const t = topStats;
    return (
      <div className="an-overview">
        {/* Global KPIs */}
        <SectionTitle>📊 Métricas Globales</SectionTitle>
        {loading.global ? (
          <div className="an-loading">Cargando métricas…</div>
        ) : error.global ? (
          <div className="an-error">{error.global}</div>
        ) : g ? (
          <>
            <div className="stat-grid">
              <StatCard label="Torneos totales"    value={g.total_tournaments}    icon="🏆" color="purple" />
              <StatCard label="Torneos activos"    value={g.active_tournaments}   icon="🟢" color="green"  />
              <StatCard label="Torneos completados" value={g.completed_tournaments} icon="✅" color="teal" />
              <StatCard label="Peleas totales"     value={g.total_fights}         icon="⚔️" color="blue"  />
              <StatCard label="Peleas completadas" value={g.completed_fights}     icon="🏁" color="blue"  sub={`${g.completion_rate}% completitud`} />
              <StatCard label="Peleas pendientes"  value={g.pending_fights}       icon="⏳" color="orange" />
              <StatCard label="Competidores únicos" value={g.distinct_competitors} icon="🥋" color="red"  />
              <StatCard label="Escuelas únicas"    value={g.distinct_academies}   icon="🏫" color="yellow"/>
              <StatCard label="Llaves totales"     value={g.total_brackets}       icon="🔑" color="indigo"/>
              <StatCard label="Podios generados"   value={g.total_podiums}        icon="🥇" color="gold"  />
            </div>

            {/* Victory types */}
            {g.victory_types?.length > 0 && (
              <div className="an-card">
                <h3 className="an-card__title">Tipos de Victoria</h3>
                <div className="vtype-grid">
                  {g.victory_types.map(vt => (
                    <div key={vt.victory_type} className="vtype-item">
                      <span className="vtype-label">{vtLabel(vt.victory_type)}</span>
                      <span className="vtype-count">{vt.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Round wins */}
            {g.round_wins && (
              <div className="an-card">
                <h3 className="an-card__title">Victorias por Ronda</h3>
                <div className="round-wins-grid">
                  {[1, 2, 3].map(r => {
                    const red  = g.round_wins[`r${r}_red`]  || 0;
                    const blue = g.round_wins[`r${r}_blue`] || 0;
                    const total = red + blue;
                    return (
                      <div key={r} className="round-item">
                        <div className="round-item__title">Ronda {r}</div>
                        <div className="round-item__bars">
                          <div className="round-bar round-bar--red">
                            <div className="round-bar__fill" style={{ width: total ? `${(red/total)*100}%` : '0%' }} />
                            <span>Rojo {red}</span>
                          </div>
                          <div className="round-bar round-bar--blue">
                            <div className="round-bar__fill" style={{ width: total ? `${(blue/total)*100}%` : '0%' }} />
                            <span>Azul {blue}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Top cards */}
        {loading.top ? (
          <div className="an-loading">Cargando top stats…</div>
        ) : t ? (
          <div className="top-grid">
            {/* Top academias */}
            <div className="an-card">
              <h3 className="an-card__title">🏅 Top Escuelas por Victorias</h3>
              {t.topAcademies?.length === 0 && <p className="an-empty">Sin datos aún</p>}
              <ol className="top-list">
                {t.topAcademies?.map((a, i) => (
                  <li key={a.academy} className="top-list__item" onClick={() => openDetail('academy', a.academy)}>
                    <RankBadge rank={i + 1} />
                    <div className="top-list__info">
                      <span className="top-list__name">{a.academy}</span>
                      <span className="top-list__meta">{a.wins}W / {a.fights - a.wins}L · {a.win_rate}%</span>
                    </div>
                    <WinBar wins={a.wins} total={a.fights} />
                  </li>
                ))}
              </ol>
            </div>

            {/* Top competidores */}
            <div className="an-card">
              <h3 className="an-card__title">🥊 Top Competidores por Victorias</h3>
              {t.topCompetitors?.length === 0 && <p className="an-empty">Sin datos aún</p>}
              <ol className="top-list">
                {t.topCompetitors?.map((c, i) => (
                  <li key={c.competitor} className="top-list__item" onClick={() => openDetail('competitor', c.competitor)}>
                    <RankBadge rank={i + 1} />
                    <div className="top-list__info">
                      <span className="top-list__name">{c.competitor}</span>
                      <span className="top-list__meta">{c.academy || '—'} · {c.wins}W / {c.fights - c.wins}L · {c.win_rate}%</span>
                    </div>
                    <WinBar wins={c.wins} total={c.fights} />
                  </li>
                ))}
              </ol>
            </div>

            {/* Torneos recientes */}
            <div className="an-card an-card--wide">
              <h3 className="an-card__title">📋 Torneos Recientes</h3>
              {t.activeTournaments?.length === 0 && <p className="an-empty">Sin torneos</p>}
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Categoría</th><th>Estado</th><th>Peleas</th><th>Completitud</th>
                  </tr>
                </thead>
                <tbody>
                  {t.activeTournaments?.map(tr => {
                    const rate = tr.total_fights > 0
                      ? Math.round((tr.completed_fights / tr.total_fights) * 100) : 0;
                    return (
                      <tr key={tr.id}>
                        <td>{tr.name}</td>
                        <td>{tr.category || '—'}</td>
                        <td><span className={`status-badge ${statusClass(tr.status)}`}>{statusLabel(tr.status)}</span></td>
                        <td>{tr.completed_fights}/{tr.total_fights}</td>
                        <td>
                          <div className="progress-bar">
                            <div className="progress-bar__fill" style={{ width: `${rate}%` }} />
                            <span>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderAcademies = () => (
    <div>
      <SectionTitle>🏫 Ranking de Escuelas / Academias</SectionTitle>
      <div className="an-search-bar">
        <input
          placeholder="Buscar academia…"
          value={academySearch}
          onChange={e => setAcademySearch(e.target.value)}
          className="an-search"
        />
        <span className="an-count">{filteredAcademies.length} escuelas</span>
      </div>
      {loading.academies ? (
        <div className="an-loading">Cargando academias…</div>
      ) : error.academies ? (
        <div className="an-error">{error.academies}</div>
      ) : (
        <div className="an-card">
          <table className="an-table an-table--hover">
            <thead>
              <tr>
                <th>#</th>
                <th>Academia / Escuela</th>
                <th>Peleas</th>
                <th>Victorias</th>
                <th>Derrotas</th>
                <th>% Victorias</th>
                <th>Barra</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredAcademies.length === 0 && (
                <tr><td colSpan={8} className="an-empty">Sin datos</td></tr>
              )}
              {filteredAcademies.map((a, i) => (
                <tr key={a.academy}>
                  <td><RankBadge rank={i + 1} /></td>
                  <td className="an-table__name">{a.academy}</td>
                  <td>{a.fights}</td>
                  <td className="cell--win">{a.wins}</td>
                  <td className="cell--loss">{a.losses}</td>
                  <td><strong>{a.win_rate}%</strong></td>
                  <td><WinBar wins={a.wins} total={a.fights} /></td>
                  <td>
                    <button className="btn-detail" onClick={() => openDetail('academy', a.academy)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderCompetitors = () => (
    <div>
      <SectionTitle>🥋 Ranking de Competidores</SectionTitle>
      <div className="an-search-bar">
        <input
          placeholder="Buscar por nombre o academia…"
          value={competitorSearch}
          onChange={e => setCompetitorSearch(e.target.value)}
          className="an-search"
        />
        <span className="an-count">{filteredCompetitors.length} competidores</span>
      </div>
      {loading.competitors ? (
        <div className="an-loading">Cargando competidores…</div>
      ) : error.competitors ? (
        <div className="an-error">{error.competitors}</div>
      ) : (
        <div className="an-card">
          <table className="an-table an-table--hover">
            <thead>
              <tr>
                <th>#</th>
                <th>Competidor</th>
                <th>Academia</th>
                <th>Peleas</th>
                <th>Victorias</th>
                <th>Derrotas</th>
                <th>% Victorias</th>
                <th>Barra</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompetitors.length === 0 && (
                <tr><td colSpan={9} className="an-empty">Sin datos</td></tr>
              )}
              {filteredCompetitors.map((c, i) => (
                <tr key={c.competitor}>
                  <td><RankBadge rank={i + 1} /></td>
                  <td className="an-table__name">{c.competitor}</td>
                  <td>{c.academy || '—'}</td>
                  <td>{c.fights}</td>
                  <td className="cell--win">{c.wins}</td>
                  <td className="cell--loss">{c.losses}</td>
                  <td><strong>{c.win_rate}%</strong></td>
                  <td><WinBar wins={c.wins} total={c.fights} /></td>
                  <td>
                    <button className="btn-detail" onClick={() => openDetail('competitor', c.competitor)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderTournaments = () => (
    <div>
      <SectionTitle>🏆 Métricas por Torneo</SectionTitle>
      <div className="an-search-bar">
        <input
          placeholder="Buscar torneo…"
          value={tournamentSearch}
          onChange={e => setTournamentSearch(e.target.value)}
          className="an-search"
        />
        <span className="an-count">{filteredTournaments.length} torneos</span>
      </div>
      {loading.tournaments ? (
        <div className="an-loading">Cargando torneos…</div>
      ) : error.tournaments ? (
        <div className="an-error">{error.tournaments}</div>
      ) : (
        <>
          {filteredTournaments.length === 0 && <p className="an-empty">Sin datos</p>}
          <div className="tournament-cards">
            {filteredTournaments.map(t => {
              const rate = t.total_fights > 0
                ? Math.round((t.completed_fights / t.total_fights) * 100) : 0;
              return (
                <div key={t.id} className="tournament-card">
                  <div className="tournament-card__header">
                    <span className="tournament-card__name">{t.name}</span>
                    <span className={`status-badge ${statusClass(t.status)}`}>{statusLabel(t.status)}</span>
                  </div>
                  {(t.category || t.division || t.weight_class) && (
                    <div className="tournament-card__meta">
                      {[t.category, t.division, t.weight_class].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div className="tournament-card__stats">
                    <div className="tc-stat">
                      <span className="tc-stat__label">Peleas</span>
                      <span className="tc-stat__val">{t.total_fights}</span>
                    </div>
                    <div className="tc-stat">
                      <span className="tc-stat__label">Completadas</span>
                      <span className="tc-stat__val cell--win">{t.completed_fights}</span>
                    </div>
                    <div className="tc-stat">
                      <span className="tc-stat__label">Pendientes</span>
                      <span className="tc-stat__val cell--orange">{t.pending_fights}</span>
                    </div>
                    <div className="tc-stat">
                      <span className="tc-stat__label">Canceladas</span>
                      <span className="tc-stat__val cell--loss">{t.cancelled_fights}</span>
                    </div>
                    <div className="tc-stat">
                      <span className="tc-stat__label">Llaves</span>
                      <span className="tc-stat__val">{t.num_brackets}</span>
                    </div>
                    <div className="tc-stat">
                      <span className="tc-stat__label">Completitud</span>
                      <span className="tc-stat__val">{rate}%</span>
                    </div>
                  </div>
                  <div className="progress-bar progress-bar--lg">
                    <div className="progress-bar__fill" style={{ width: `${rate}%` }} />
                    <span>{rate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const renderBrackets = () => (
    <div>
      <SectionTitle>🔑 Métricas por Llave</SectionTitle>
      {loading.brackets ? (
        <div className="an-loading">Cargando llaves…</div>
      ) : error.brackets ? (
        <div className="an-error">{error.brackets}</div>
      ) : (
        <>
          {(bracketMetrics || []).length === 0 && <p className="an-empty">Sin llaves registradas</p>}
          <div className="an-card">
            <table className="an-table an-table--hover">
              <thead>
                <tr>
                  <th>Llave</th>
                  <th>Torneo</th>
                  <th>Categoría / División</th>
                  <th>Competidores</th>
                  <th>Partidas</th>
                  <th>Completadas</th>
                  <th>1° Lugar</th>
                  <th>2° Lugar</th>
                  <th>3° Lugar</th>
                </tr>
              </thead>
              <tbody>
                {(bracketMetrics || []).map(b => (
                  <tr key={b.id}>
                    <td className="an-table__name">{b.bracket_name}</td>
                    <td>{b.tournament_name}</td>
                    <td>{[b.category, b.division, b.weight_class].filter(Boolean).join(' / ') || '—'}</td>
                    <td>{b.num_competitors}</td>
                    <td>{b.total_matches}</td>
                    <td>
                      {b.total_matches > 0
                        ? <><span className="cell--win">{b.completed_matches}</span>/{b.total_matches}</>
                        : '—'}
                    </td>
                    <td>{b.first_place ? `🥇 ${b.first_place}` : '—'}</td>
                    <td>{b.second_place ? `🥈 ${b.second_place}` : '—'}</td>
                    <td>{b.third_place ? `🥉 ${b.third_place}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // SCORING TAB
  // ─────────────────────────────────────────────────────────
  const actionLabel = a => ({
    punch_body:         'Puñetazo al cuerpo',
    kick_body:          'Patada al cuerpo',
    kick_head:          'Patada a la cabeza',
    spinning_kick_body: 'Giro al cuerpo',
    spinning_kick_head: 'Giro a la cabeza',
    gam_jeom:           'Gam-jeom (falta)',
  }[a] || a);

  const actionIcon = a => ({
    punch_body:         '👊',
    kick_body:          '🦵',
    kick_head:          '🎯',
    spinning_kick_body: '🌀',
    spinning_kick_head: '💫',
    gam_jeom:           '⚠️',
  }[a] || '•');

  const renderScoring = () => {
    const sm = scoringMetrics;
    const z  = sm?.zoneStats || {};
    const totalZonePts = (z.head_points || 0) + (z.body_points || 0) + (z.gam_jeom_points || 0);
    const p  = sm?.precision || {};
    const totalVotes = p.total_votes || 0;
    const connPct = totalVotes > 0 ? Math.round((p.connected_votes / totalVotes) * 100) : 0;
    const missPct = totalVotes > 0 ? Math.round((p.missed_votes / totalVotes) * 100) : 0;

    return (
      <div>
        <SectionTitle>⚡ Scoring — Técnicas, Zonas y Precisión</SectionTitle>

        {loading.scoring ? (
          <div className="an-loading">Cargando scoring…</div>
        ) : error.scoring ? (
          <div className="an-error">{error.scoring}</div>
        ) : sm ? (
          <>
            {/* Row 1: zone + judge precision */}
            <div className="scoring-top-grid">
              {/* Zona */}
              <div className="an-card">
                <h3 className="an-card__title">🎯 Distribución por Zona</h3>
                {!totalZonePts ? <p className="an-empty">Sin datos de puntos</p> : (
                  <div className="zone-breakdown">
                    <div className="zone-item">
                      <span className="zone-icon">💫</span>
                      <span className="zone-label">Cabeza</span>
                      <span className="zone-pts">{z.head_points || 0} pts · {z.head_count || 0}×</span>
                      <div className="win-bar">
                        <div className="win-bar__fill zone-bar--head" style={{ width: `${totalZonePts ? ((z.head_points||0)/totalZonePts*100).toFixed(1) : 0}%` }} />
                        <span className="win-bar__label">{totalZonePts ? ((z.head_points||0)/totalZonePts*100).toFixed(1) : 0}%</span>
                      </div>
                    </div>
                    <div className="zone-item">
                      <span className="zone-icon">🦵</span>
                      <span className="zone-label">Cuerpo</span>
                      <span className="zone-pts">{z.body_points || 0} pts · {z.body_count || 0}×</span>
                      <div className="win-bar">
                        <div className="win-bar__fill zone-bar--body" style={{ width: `${totalZonePts ? ((z.body_points||0)/totalZonePts*100).toFixed(1) : 0}%` }} />
                        <span className="win-bar__label">{totalZonePts ? ((z.body_points||0)/totalZonePts*100).toFixed(1) : 0}%</span>
                      </div>
                    </div>
                    {(z.gam_jeom_points || 0) > 0 && (
                      <div className="zone-item">
                        <span className="zone-icon">⚠️</span>
                        <span className="zone-label">Gam-jeom</span>
                        <span className="zone-pts">{z.gam_jeom_points} pts</span>
                        <div className="win-bar">
                          <div className="win-bar__fill zone-bar--gamjeom" style={{ width: `${totalZonePts ? ((z.gam_jeom_points||0)/totalZonePts*100).toFixed(1) : 0}%` }} />
                          <span className="win-bar__label">{totalZonePts ? ((z.gam_jeom_points||0)/totalZonePts*100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    )}
                    <div className="zone-total">
                      Total: <strong>{z.total_points || 0}</strong> pts en <strong>{z.total_events || 0}</strong> acciones
                    </div>
                  </div>
                )}
              </div>

              {/* Precisión */}
              <div className="an-card">
                <h3 className="an-card__title">💡 Precisión de Jueces</h3>
                <p className="an-card__sub">
                  Un voto "perdido" es cuando un juez marca pero los demás no confirman a tiempo → el punto no cuenta.
                </p>
                {!totalVotes ? <p className="an-empty">Sin votos registrados aún</p> : (
                  <>
                    <div className="stat-grid stat-grid--sm">
                      <StatCard label="Total votos"  value={totalVotes}          color="blue"   icon="🗳️" />
                      <StatCard label="Conectados"   value={p.connected_votes||0} color="green"  icon="✅" sub={`${connPct}%`} />
                      <StatCard label="Perdidos"     value={p.missed_votes||0}    color="red"    icon="❌" sub={`${missPct}%`} />
                    </div>
                    <div className="precision-bar-wrap">
                      <div className="precision-bar">
                        <div className="precision-bar__fill precision-bar__fill--conn" style={{ width: `${connPct}%` }} />
                        <div className="precision-bar__fill precision-bar__fill--miss" style={{ width: `${missPct}%`, marginLeft: `${connPct}%` }} />
                      </div>
                      <div className="precision-labels">
                        <span className="cell--win">✅ {connPct}% conectados</span>
                        <span className="cell--loss">❌ {missPct}% perdidos</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* By action */}
            {sm.byAction?.length > 0 && (
              <div className="an-card">
                <h3 className="an-card__title">🥊 Puntos por Técnica</h3>
                <table className="an-table an-table--hover">
                  <thead>
                    <tr>
                      <th>Técnica</th>
                      <th>Veces marcada</th>
                      <th>Puntos totales</th>
                      <th>Votos jueces</th>
                      <th>Conectados</th>
                      <th>Perdidos</th>
                      <th>Precisión</th>
                      <th>% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sm.byAction.map(a => {
                      const jRow = sm.judgeStats?.find(x => x.action === a.action) || {};
                      const tv   = jRow.total_votes     || 0;
                      const cv   = jRow.connected_votes || 0;
                      const mv   = jRow.missed_votes    || 0;
                      const acc  = tv > 0 ? Math.round(cv / tv * 100) : null;
                      return (
                        <tr key={a.action}>
                          <td>{actionIcon(a.action)} {actionLabel(a.action)}</td>
                          <td>{a.times_awarded}</td>
                          <td><strong>{a.total_points}</strong></td>
                          <td>{tv || '—'}</td>
                          <td className="cell--win">{cv || '—'}</td>
                          <td className="cell--loss">{mv || '—'}</td>
                          <td>{acc !== null ? <span className={acc >= 50 ? 'cell--win' : 'cell--loss'}>{acc}%</span> : '—'}</td>
                          <td><WinBar wins={a.total_points} total={z.total_points || 1} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* By round */}
            {sm.byRound?.length > 0 && (
              <div className="an-card">
                <h3 className="an-card__title">🔄 Puntos por Ronda</h3>
                <table className="an-table">
                  <thead>
                    <tr><th>Ronda</th><th>🔴 Rojo</th><th>🔵 Azul</th><th>Total ronda</th></tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].map(r => {
                      const red  = sm.byRound.find(x => x.round === r && x.team === 'red');
                      const blue = sm.byRound.find(x => x.round === r && x.team === 'blue');
                      const rp   = red?.round_points  || 0;
                      const bp   = blue?.round_points || 0;
                      if (!rp && !bp) return null;
                      return (
                        <tr key={r}>
                          <td>Ronda {r}</td>
                          <td className="cell--loss">{rp}</td>
                          <td className="cell--win">{bp}</td>
                          <td><strong>{rp + bp}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {/* Competitor scoring table */}
        <SectionTitle>🥋 Scoring por Competidor</SectionTitle>
        {loading.scoringComp ? (
          <div className="an-loading">Cargando…</div>
        ) : error.scoringComp ? (
          <div className="an-error">{error.scoringComp}</div>
        ) : (
          <div className="an-card">
            <table className="an-table an-table--hover">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Competidor</th>
                  <th>Academia</th>
                  <th>Pts</th>
                  <th>💫 Cabeza</th>
                  <th>🦵 Cuerpo</th>
                  <th>⚠️ Gam-j</th>
                  <th>Técnica fav.</th>
                  <th>Votos</th>
                  <th>Conectados</th>
                  <th>Perdidos</th>
                  <th>Precisión</th>
                </tr>
              </thead>
              <tbody>
                {!(scoringCompetitors?.length) && (
                  <tr><td colSpan={12} className="an-empty">Sin datos de scoring</td></tr>
                )}
                {(scoringCompetitors || []).map((c, i) => (
                  <tr key={c.competitor}>
                    <td><RankBadge rank={i + 1} /></td>
                    <td className="an-table__name">{c.competitor}</td>
                    <td>{c.academy || '—'}</td>
                    <td><strong>{c.total_points}</strong></td>
                    <td className="cell--head">{c.head_points || 0}</td>
                    <td>{c.body_points || 0}</td>
                    <td className="cell--orange">{c.gam_jeom_pts || 0}</td>
                    <td><span className="fav-action">{actionIcon(c.fav_action)} {actionLabel(c.fav_action)}</span></td>
                    <td>{c.total_votes || '—'}</td>
                    <td className="cell--win">{c.connected_votes || '—'}</td>
                    <td className="cell--loss">{c.missed_votes || '—'}</td>
                    <td>
                      {c.accuracy_pct !== null && c.accuracy_pct !== undefined
                        ? <span className={c.accuracy_pct >= 50 ? 'cell--win' : 'cell--loss'}>{c.accuracy_pct}%</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────
  // DETAIL MODAL
  // ─────────────────────────────────────────────────────────
  const renderDetailModal = () => {
    if (!detailType) return null;
    const isComp = detailType === 'competitor';
    return (
      <div className="modal-overlay" onClick={closeDetail}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={closeDetail}>✕</button>
          <h2 className="modal-title">
            {isComp ? '🥋' : '🏫'} {detailName}
          </h2>

          {detailLoading && <div className="an-loading">Cargando detalle…</div>}

          {!detailLoading && detailData && (
            <>
              {/* KPIs */}
              <div className="stat-grid stat-grid--sm">
                <StatCard label="Peleas" value={detailData.total_fights} color="blue" />
                <StatCard label="Victorias" value={detailData.wins} color="green" />
                <StatCard label="Derrotas" value={detailData.losses} color="red" />
                <StatCard label="% Victorias" value={`${detailData.win_rate}%`} color="teal" />
              </div>

              {/* Academia: lista de competidores */}
              {!isComp && detailData.competitors?.length > 0 && (
                <>
                  <h3 className="modal-subtitle">Competidores de esta academia</h3>
                  <div className="detail-competitors">
                    {detailData.competitors.map(c => (
                      <span key={c.competitor} className="detail-chip">{c.competitor}</span>
                    ))}
                  </div>
                </>
              )}

              {/* Podios (academias) */}
              {!isComp && detailData.podiums?.length > 0 && (
                <>
                  <h3 className="modal-subtitle">🏅 Podios</h3>
                  <table className="an-table">
                    <thead>
                      <tr><th>Torneo</th><th>Posición</th></tr>
                    </thead>
                    <tbody>
                      {detailData.podiums.map(p => {
                        const pos = [];
                        const nm = detailName.toLowerCase();
                        if (p.first_place_academy?.toLowerCase().includes(nm))  pos.push('🥇 1° lugar');
                        if (p.second_place_academy?.toLowerCase().includes(nm)) pos.push('🥈 2° lugar');
                        if (p.third_place_1_academy?.toLowerCase().includes(nm)) pos.push('🥉 3° lugar');
                        if (p.third_place_2_academy?.toLowerCase().includes(nm)) pos.push('🥉 3° lugar');
                        return (
                          <tr key={p.id}>
                            <td>{p.tournament_name}</td>
                            <td>{pos.join(', ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Historial de peleas */}
              {detailData.fights?.length > 0 && (
                <>
                  <h3 className="modal-subtitle">Historial de Peleas ({detailData.fights.length})</h3>
                  <div className="detail-fights-scroll">
                    <table className="an-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Torneo</th>
                          <th>Rojo</th>
                          <th>Azul</th>
                          <th>Resultado</th>
                          <th>Tipo Victoria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.fights.map(f => {
                          const side = isComp ? f.side : (
                            f.academy_red?.toLowerCase().includes(detailName.toLowerCase()) ? 'red' : 'blue'
                          );
                          const won = f.final_winner === side;
                          return (
                            <tr key={f.id} className={won ? 'row--win' : 'row--loss'}>
                              <td>{f.fight_number}</td>
                              <td>{f.tournament_name}</td>
                              <td className={f.final_winner === 'red' ? 'cell--win' : ''}>{f.competitor_red}</td>
                              <td className={f.final_winner === 'blue' ? 'cell--win' : ''}>{f.competitor_blue}</td>
                              <td>
                                <span className={`result-badge ${won ? 'result-badge--win' : 'result-badge--loss'}`}>
                                  {won ? 'Victoria' : 'Derrota'}
                                </span>
                              </td>
                              <td>{vtLabel(f.victory_type)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
          {!detailLoading && !detailData && (
            <p className="an-empty">No se encontraron datos.</p>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="analytics-page">
      {/* Header */}
      <div className="an-header">
        <div className="an-header__left">
          <Link to="/admin" className="an-back-btn">← Volver al Admin</Link>
          <h1 className="an-title">📊 Dashboard & Reportes</h1>
        </div>
        <button
          className="an-refresh-btn"
          onClick={() => {
            setGlobalMetrics(null); setTopStats(null);
            setAcademyRanking(null); setCompetitorRanking(null);
            setTournamentMetrics(null); setBracketMetrics(null);
            setScoringMetrics(null); setScoringCompetitors(null);
            loadSection('global', () => api.getAnalyticsGlobal(selectedTournamentId)).then(d => d && setGlobalMetrics(d));
            loadSection('top',    () => api.getAnalyticsTop(5, selectedTournamentId)).then(d => d && setTopStats(d));
          }}
          title="Recargar datos"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Tournament selector */}
      <div className="an-tournament-selector">
        <label className="an-selector-label">🏆 Torneo:</label>
        <select
          className="an-selector"
          value={selectedTournamentId ?? ''}
          onChange={e => setSelectedTournamentId(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">🌐 Todos los torneos</option>
          {tournamentsList.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.category ? ` · ${t.category}` : ''}
            </option>
          ))}
        </select>
        {selectedTournamentId && (
          <button className="an-selector-clear" onClick={() => setSelectedTournamentId(null)}>
            ✕ Todos
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="an-content">
        {activeTab === 'overview'    && renderOverview()}
        {activeTab === 'academies'   && renderAcademies()}
        {activeTab === 'competitors' && renderCompetitors()}
        {activeTab === 'tournaments' && renderTournaments()}
        {activeTab === 'brackets'    && renderBrackets()}
        {activeTab === 'scoring'     && renderScoring()}
      </div>

      {/* Detail modal */}
      {renderDetailModal()}
    </div>
  );
}
