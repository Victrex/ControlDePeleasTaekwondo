import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Zap, Check, AlertCircle, UserPlus, ChevronRight } from 'lucide-react';
import api from '../../utils/api';
import './QuickCheckIn.css';

const BELT_NAMES  = ['Blanco','Blanco-Amarillo','Amarillo','Naranja','Verde','Azul-Verde','Azul','Rojo','Rojo-Negro','Negro'];
const BELT_COLORS = ['#d1d5db','#F0E68C','#FFD700','#FF8C00','#2E8B57','#1a9e8c','#1565C0','#C62828','#850000','#212121'];
const BELT_TEXT   = ['#111',   '#555',   '#333',   '#fff',  '#fff',  '#fff',   '#fff',  '#fff',  '#fff',  '#fff'];

const emptyForm = { name: '', academy: '', dob: '', weight: '', gender: '', belt: 0 };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function QuickCheckIn() {
  const navigate = useNavigate();
  const nameRef = useRef(null);
  const [form, setForm] = useState(emptyForm);
  const [suggested, setSuggested] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [brackets, setBrackets] = useState([]);
  const [selectedBracketId, setSelectedBracketId] = useState('');
  const [peto, setPeto] = useState('blue');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState([]);
  const [showAutoAssign, setShowAutoAssign] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
    api.getTournaments().then(data => setTournaments(data.filter(t => t.status === 'active')));
  }, []);

  // Sugerir categorías en tiempo real cuando cambian los datos relevantes
  const fetchSuggestions = useCallback(
    debounce(async (data) => {
      if (!data.dob && !data.belt == null) { setSuggested([]); return; }
      try {
        const cats = await api.suggestCategoryFromData({
          dob: data.dob || null,
          weight: data.weight ? parseFloat(data.weight) : null,
          gender: data.gender || null,
          belt: parseInt(data.belt) ?? 0
        });
        setSuggested(cats);
        if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0]);
      } catch (_) { setSuggested([]); }
    }, 400),
    []
  );

  useEffect(() => {
    fetchSuggestions(form);
  }, [form.dob, form.weight, form.gender, form.belt]);

  // Cargar llaves cuando el usuario selecciona un torneo en el auto-asignar
  const loadBrackets = async (tournamentId) => {
    if (!tournamentId) { setBrackets([]); return; }
    const data = await api.getBracketsByTournament(tournamentId);
    setBrackets(data);
    setSelectedBracketId(data[0]?.id || '');
  };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      const athlete = await api.createAthlete(form);

      // Si eligió auto-asignar a llave
      if (showAutoAssign && selectedBracketId) {
        await api.batchAssign([{
          athlete_id: athlete.athlete.id,
          bracket_id: parseInt(selectedBracketId),
          peto_color: peto,
          seed: null
        }]);
      }

      setSaved(prev => [{ ...athlete.athlete, bracket_id: showAutoAssign ? selectedBracketId : null }, ...prev]);
      setForm(emptyForm);
      setSuggested([]);
      setSelectedCategory(null);
      nameRef.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-checkin">
      <div className="qc-header">
        <button className="qc-back-btn" onClick={() => navigate('/admin')}>
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="qc-title">
          <Zap size={24} />
          <div>
            <h1>Registro Rápido</h1>
            <span>Modo caliente — día del torneo</span>
          </div>
        </div>
        <div className="qc-saved-count">
          <UserPlus size={16} />
          <strong>{saved.length}</strong> registrado{saved.length !== 1 ? 's' : ''} hoy
        </div>
      </div>

      <div className="qc-body">
        {/* Form */}
        <div className="qc-form-card">
          <h2>Nuevo atleta</h2>
          {error && <div className="qc-error"><AlertCircle size={14} /> {error}</div>}

          <div className="qc-form-grid">
            <label className="qc-full-col">
              Nombre completo *
              <input
                ref={nameRef}
                value={form.name}
                onChange={e => setF('name', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="Nombre del atleta"
                className="qc-input-large"
              />
            </label>

            <label>
              Academia
              <input value={form.academy} onChange={e => setF('academy', e.target.value)} placeholder="Club / Academia" />
            </label>

            <label>
              Fecha de nacimiento
              <input type="date" value={form.dob} onChange={e => setF('dob', e.target.value)} />
            </label>

            <label>
              Peso (kg)
              <input type="number" step="0.5" min="0" value={form.weight} onChange={e => setF('weight', e.target.value)} placeholder="Ej: 38.5" />
            </label>

            <label>
              Género
              <div className="qc-radio-group">
                {[['M', 'Masc.'], ['F', 'Fem.']].map(([v, l]) => (
                  <button
                    key={v}
                    className={`qc-radio-btn ${form.gender === v ? 'active' : ''}`}
                    onClick={() => setF('gender', form.gender === v ? '' : v)}
                  >{l}</button>
                ))}
              </div>
            </label>
          </div>

          {/* Belt Selector — visually prominent */}
          <div className="qc-belt-section">
            <span className="qc-section-label">Cinturón</span>
            <div className="qc-belt-grid">
              {BELT_NAMES.map((name, i) => (
                <button
                  key={i}
                  className={`qc-belt-btn ${form.belt === i ? 'selected' : ''}`}
                  style={{ '--belt-color': BELT_COLORS[i], '--belt-text': BELT_TEXT[i] }}
                  onClick={() => setF('belt', i)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Category suggestion */}
          {suggested.length > 0 && (
            <div className="qc-suggestions">
              <span className="qc-section-label">Categoría sugerida</span>
              <div className="qc-suggestion-list">
                {suggested.map(cat => (
                  <button
                    key={cat.id}
                    className={`qc-suggestion-item ${selectedCategory?.id === cat.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {selectedCategory?.id === cat.id && <Check size={12} />}
                    {cat.name}
                    <small>{cat.min_age}–{cat.max_age} años · {BELT_NAMES[cat.belt_min]}{cat.belt_min !== cat.belt_max ? `→${BELT_NAMES[cat.belt_max]}` : ''}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Auto-assign to bracket */}
          <div className="qc-assign-section">
            <button
              className={`qc-toggle-assign ${showAutoAssign ? 'open' : ''}`}
              onClick={() => setShowAutoAssign(v => !v)}
            >
              <ChevronRight size={14} className="qc-chevron" />
              Asignar a llave ahora
            </button>
            {showAutoAssign && (
              <div className="qc-assign-fields">
                <label>
                  Torneo
                  <select onChange={e => loadBrackets(e.target.value)}>
                    <option value="">— Seleccionar torneo —</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label>
                  Llave
                  <select value={selectedBracketId} onChange={e => setSelectedBracketId(e.target.value)} disabled={brackets.length === 0}>
                    <option value="">— Seleccionar llave —</option>
                    {brackets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                <label>
                  Peto
                  <div className="qc-radio-group">
                    <button className={`qc-peto-btn blue ${peto === 'blue' ? 'active' : ''}`} onClick={() => setPeto('blue')}>Azul</button>
                    <button className={`qc-peto-btn red ${peto === 'red' ? 'active' : ''}`} onClick={() => setPeto('red')}>Rojo</button>
                  </div>
                </label>
              </div>
            )}
          </div>

          <button className="qc-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : <><Check size={16} /> Registrar atleta</>}
          </button>
        </div>

        {/* Recently registered */}
        {saved.length > 0 && (
          <div className="qc-recent">
            <h3>Registrados en esta sesión</h3>
            <ul>
              {saved.map((a, i) => (
                <li key={i}>
                  <span
                    className="qc-mini-belt"
                    style={{ background: BELT_COLORS[a.belt ?? 0], color: BELT_TEXT[a.belt ?? 0] }}
                  >
                    {BELT_NAMES[a.belt ?? 0][0]}
                  </span>
                  <div>
                    <strong>{a.name}</strong>
                    <small>{a.academy || 'Sin academia'}{a.bracket_id ? ' · ✓ asignado a llave' : ''}</small>
                  </div>
                </li>
              ))}
            </ul>
            <button className="qc-go-registry" onClick={() => navigate('/admin/athletes')}>
              Ver registro completo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
