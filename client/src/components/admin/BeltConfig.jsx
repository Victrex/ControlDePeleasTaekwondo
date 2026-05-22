import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, RefreshCw, Shield, Check } from 'lucide-react';
import { DEFAULT_BELTS, BELT_CONFIG_STORAGE_KEY, loadBeltConfig } from '../../utils/beltConfig';
import './BeltConfig.css';

export default function BeltConfig() {
  const navigate = useNavigate();
  const [belts, setBelts] = useState(() => loadBeltConfig());
  const [savedMsg, setSavedMsg] = useState(false);

  const update = (i, field, value) =>
    setBelts(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b));

  const handleSave = () => {
    localStorage.setItem(BELT_CONFIG_STORAGE_KEY, JSON.stringify(belts));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const handleReset = () => {
    if (!window.confirm('¿Restablecer toda la tabla KUP a los valores por defecto?')) return;
    localStorage.removeItem(BELT_CONFIG_STORAGE_KEY);
    setBelts(DEFAULT_BELTS);
  };

  return (
    <div className="bc-page">
      <div className="bc-header">
        <button className="bc-btn-back" onClick={() => navigate('/admin')}>
          <ChevronLeft size={16} /> Volver
        </button>
        <div className="bc-title">
          <Shield size={22} className="bc-title-icon" />
          <div>
            <h1>Tabla de Cinturones KUP</h1>
            <p>Configura nombres, colores y alias para importación Excel/CSV</p>
          </div>
        </div>
        <div className="bc-actions">
          <button className="bc-btn-ghost" onClick={handleReset}>
            <RefreshCw size={13} /> Restablecer
          </button>
          <button
            className={`bc-btn-primary${savedMsg ? ' bc-saved' : ''}`}
            onClick={handleSave}
          >
            {savedMsg
              ? <><Check size={13} /> ¡Guardado!</>
              : <><Save size={13} /> Guardar cambios</>
            }
          </button>
        </div>
      </div>

      <div className="bc-notice">
        <strong>Alias de importación:</strong> Son los textos que acepta la columna Cinturón al importar Excel.
        Puedes poner varios separados por coma. El <em>Nombre (display)</em> es lo que aparece en pantalla.
        Guarda los cambios para que la importación los use.
      </div>

      <div className="bc-wrap">
        <table className="bc-table">
          <thead>
            <tr>
              <th className="bc-th-sm">#</th>
              <th className="bc-th-sm">KUP</th>
              <th className="bc-th-color">Color  ·  Texto</th>
              <th className="bc-th-name">Nombre (display)</th>
              <th>Aliases de importación <span className="bc-th-hint">(separados por coma)</span></th>
            </tr>
          </thead>
          <tbody>
            {belts.map((b, i) => (
              <tr key={i} className="bc-row">
                <td className="bc-td-center bc-idx">{b.index}</td>
                <td className="bc-td-center bc-kup">{b.kup}</td>
                <td>
                  <div className="bc-color-row">
                    <input
                      type="color"
                      value={b.color}
                      onChange={e => update(i, 'color', e.target.value)}
                      className="bc-color-picker"
                      title="Seleccionar color de fondo"
                    />
                    <input
                      type="text"
                      value={b.color}
                      onChange={e => update(i, 'color', e.target.value)}
                      className="bc-hex"
                      maxLength={7}
                      placeholder="#000000"
                    />
                    <span
                      className="bc-badge-preview"
                      style={{ background: b.color, color: b.textColor }}
                    >
                      {b.name || '—'}
                    </span>
                    <select
                      value={b.textColor}
                      onChange={e => update(i, 'textColor', e.target.value)}
                      className="bc-text-select"
                      title="Color del texto del badge"
                    >
                      <option value="#111">Texto oscuro</option>
                      <option value="#333">Texto gris</option>
                      <option value="#555">Texto medio</option>
                      <option value="#fff">Texto blanco</option>
                    </select>
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    value={b.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    className="bc-name-input"
                    placeholder="Nombre del cinturón"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={b.aliases}
                    onChange={e => update(i, 'aliases', e.target.value)}
                    className="bc-alias-input"
                    placeholder="alias1, alias2, alias3"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bc-footer-hint">
        Los cambios se guardan en este navegador. Haz clic en <strong>Guardar cambios</strong> para aplicarlos a la importación.
      </div>
    </div>
  );
}
