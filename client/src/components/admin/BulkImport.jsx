import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Upload, FileSpreadsheet, Check, AlertCircle, X, RefreshCw, Users, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import api from '../../utils/api';
import './BulkImport.css';

const BELT_NAMES = ['Blanco', 'Amarillo', 'Naranja', 'Verde', 'Azul', 'Rojo', 'Negro'];
const BELT_COLORS = ['#d1d5db','#FFD700','#FF8C00','#2E8B57','#1565C0','#C62828','#212121'];
const BELT_TEXT   = ['#111',   '#333',   '#fff',   '#fff',  '#fff',  '#fff',  '#fff'];

const FIELD_LABELS = {
  name:           'Nombre',
  academy:        'Academia',
  dob:            'Fecha nacimiento (YYYY-MM-DD)',
  weight:         'Peso (kg)',
  gender:         'Género (M/F)',
  belt:           'Cinturón (0-6 o nombre)',
  license_number: 'Licencia',
};
const REQUIRED_FIELDS = ['name'];

const BELT_MAP = {};
BELT_NAMES.forEach((n, i) => {
  BELT_MAP[n.toLowerCase()] = i;
  BELT_MAP[String(i)] = i;
});
const GENDER_MAP = { masculino: 'M', femenino: 'F', male: 'M', female: 'F', hombre: 'M', mujer: 'F', m: 'M', f: 'F' };

function normalizeRow(row, mapping) {
  const out = {};
  for (const [field, col] of Object.entries(mapping)) {
    if (!col) continue;
    let val = (row[col] ?? '').toString().trim();
    if (!val) continue;
    if (field === 'belt') {
      const k = val.toLowerCase();
      out.belt = BELT_MAP[k] ?? parseInt(val) ?? 0;
    } else if (field === 'gender') {
      out.gender = GENDER_MAP[val.toLowerCase()] ?? val.toUpperCase();
    } else if (field === 'weight') {
      out.weight = parseFloat(val.replace(',', '.'));
    } else {
      out[field] = val;
    }
  }
  return out;
}

export default function BulkImport() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload'); // upload | mapping | preview | done
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawData, setRawData] = useState([]);
  const [mapping, setMapping] = useState({});
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  const downloadTemplate = () => {
    const headers = ['Nombre', 'Academia', 'Fecha_Nacimiento', 'Peso_kg', 'Genero', 'Cinturon', 'Licencia'];
    const examples = [
      ['Juan Pérez',    'Club Dragón',   '2010-04-15', 32.5, 'M', 'Verde',    'LIC-001'],
      ['María López',   'Taekwondo Elite','2008-09-22', 45.0, 'F', 'Azul',     'LIC-002'],
      ['Carlos Ruiz',   'Academia Fénix','2015-01-30', 28.0, 'M', 'Amarillo', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);

    // Anchos de columna
    ws['!cols'] = [22, 20, 20, 12, 10, 14, 14].map(w => ({ wch: w }));

    // Estilo de encabezados (fill gris oscuro, texto blanco, negrita)
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E3A5F' } },
      alignment: { horizontal: 'center' },
      border: { bottom: { style: 'thin', color: { rgb: '3B82F6' } } }
    };
    headers.forEach((_, i) => {
      const cell = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[cell]) ws[cell].s = headerStyle;
    });

    // Hoja de referencia de cinturones
    const refData = [
      ['Valor numérico', 'Nombre del cinturón'],
      [0, 'Blanco'],
      [1, 'Amarillo'],
      [2, 'Naranja'],
      [3, 'Verde'],
      [4, 'Azul'],
      [5, 'Rojo'],
      [6, 'Negro'],
      ['', ''],
      ['Género', ''],
      ['M', 'Masculino'],
      ['F', 'Femenino'],
      ['', ''],
      ['Fecha', 'Formato: AAAA-MM-DD (ej: 2010-04-15)'],
    ];
    const wsRef = XLSX.utils.aoa_to_sheet(refData);
    wsRef['!cols'] = [{ wch: 20 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Atletas');
    XLSX.utils.book_append_sheet(wb, wsRef, 'Referencia');

    XLSX.writeFile(wb, 'plantilla_atletas.xlsx');
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: ({ data, meta }) => {
          setRawHeaders(meta.fields || []);
          setRawData(data);
          autoMap(meta.fields || []);
          setStep('mapping');
        },
        error: (e) => setError('Error al leer CSV: ' + e.message)
      });
    } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!data.length) { setError('Hoja vacía'); return; }
        const headers = Object.keys(data[0]);
        setRawHeaders(headers);
        setRawData(data);
        autoMap(headers);
        setStep('mapping');
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Formato no soportado. Use .csv, .xlsx, .xls o .ods');
    }
  };

  const autoMap = (headers) => {
    const m = {};
    const norm = (s) => s.toLowerCase().replace(/[\s_-]/g, '');
    for (const field of Object.keys(FIELD_LABELS)) {
      const match = headers.find(h => {
        const n = norm(h);
        return n === norm(field) || n.includes(norm(field)) ||
          (field === 'name' && (n.includes('nombre') || n.includes('atleta'))) ||
          (field === 'academy' && (n.includes('club') || n.includes('acad') || n.includes('equipo'))) ||
          (field === 'dob' && (n.includes('nac') || n.includes('birth') || n.includes('fecha'))) ||
          (field === 'belt' && (n.includes('cinturon') || n.includes('cinto') || n.includes('belt') || n.includes('grado'))) ||
          (field === 'gender' && (n.includes('genero') || n.includes('sexo'))) ||
          (field === 'weight' && (n.includes('peso') || n.includes('weight')));
      });
      m[field] = match || '';
    }
    setMapping(m);
  };

  const buildPreview = () => {
    const built = rawData.map(r => normalizeRow(r, mapping));
    setRows(built);
    setStep('preview');
  };

  const isValid = (row) => REQUIRED_FIELDS.every(f => row[f]?.toString().trim());
  const validRows = rows.filter(isValid);

  const handleImport = async () => {
    setImporting(true); setError('');
    try {
      const res = await api.importAthletes(validRows);
      setResult(res);
      setStep('done');
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload'); setRawHeaders([]); setRawData([]); setMapping({});
    setRows([]); setResult(null); setFileName(''); setError('');
  };

  return (
    <div className="bulk-import">
      <div className="bi-header">
        <button className="bi-back-btn" onClick={() => navigate('/admin/athletes')}>
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="bi-title">
          <FileSpreadsheet size={24} />
          <div>
            <h1>Importar Atletas</h1>
            <span>CSV, Excel o LibreOffice Calc</span>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bi-steps">
        {['Archivo', 'Columnas', 'Vista previa', 'Listo'].map((s, i) => (
          <React.Fragment key={i}>
            <div className={`bi-step ${['upload','mapping','preview','done'].indexOf(step) >= i ? 'done' : ''} ${['upload','mapping','preview','done'][i] === step ? 'active' : ''}`}>
              <span>{i + 1}</span> {s}
            </div>
            {i < 3 && <div className="bi-step-line" />}
          </React.Fragment>
        ))}
      </div>

      {error && <div className="bi-error"><AlertCircle size={14} /> {error}</div>}

      {/* Step: upload */}
      {step === 'upload' && (
        <>
          <div
            className="bi-dropzone"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef} type="file"
              accept=".csv,.xlsx,.xls,.ods"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <Upload size={40} />
            <p>Arrastra tu archivo aquí o haz clic para seleccionar</p>
            <small>Soportado: .csv · .xlsx · .xls · .ods</small>
          </div>
          <div className="bi-template-hint">
            <span>¿No tienes el formato correcto?</span>
            <button className="bi-btn-template" onClick={downloadTemplate}>
              <Download size={14} /> Descargar plantilla Excel
            </button>
          </div>
        </>
      )}

      {/* Step: mapping */}
      {step === 'mapping' && (
        <div className="bi-mapping-card">
          <h2>Mapeo de columnas</h2>
          <p className="bi-subtitle">Relaciona las columnas de tu archivo con los campos del sistema. Los campos marcados con * son obligatorios.</p>
          <div className="bi-mapping-grid">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field} className="bi-mapping-row">
                <label>{label}{REQUIRED_FIELDS.includes(field) ? ' *' : ''}</label>
                <select value={mapping[field] || ''} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}>
                  <option value="">— Sin mapear —</option>
                  {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="bi-footer">
            <button className="bi-btn-ghost" onClick={reset}><X size={14} /> Cancelar</button>
            <button className="bi-btn-primary" onClick={buildPreview} disabled={!mapping.name}>
              Continuar → Vista previa
            </button>
          </div>
        </div>
      )}

      {/* Step: preview */}
      {step === 'preview' && (
        <div className="bi-preview-card">
          <div className="bi-preview-summary">
            <span className="bi-badge valid">{validRows.length} válidos</span>
            <span className="bi-badge invalid">{rows.length - validRows.length} con errores</span>
          </div>
          <div className="bi-table-wrap">
            <table className="bi-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Nombre</th><th>Academia</th><th>Género</th>
                  <th>Cinturón</th><th>Peso</th><th>Fecha Nac.</th><th>Licencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const valid = isValid(row);
                  return (
                    <tr key={i} className={valid ? '' : 'bi-invalid-row'}>
                      <td>{valid ? <Check size={12} className="bi-ok" /> : <AlertCircle size={12} className="bi-bad" />}</td>
                      <td>{row.name || <em className="bi-missing">Vacío</em>}</td>
                      <td>{row.academy || '—'}</td>
                      <td>{row.gender || '—'}</td>
                      <td>
                        {row.belt != null
                          ? <span className="bi-belt-badge" style={{ background: BELT_COLORS[row.belt] ?? '#888', color: BELT_TEXT[row.belt] ?? '#fff' }}>{BELT_NAMES[row.belt] ?? row.belt}</span>
                          : '—'}
                      </td>
                      <td>{row.weight ?? '—'}</td>
                      <td>{row.dob || '—'}</td>
                      <td>{row.license_number || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bi-footer">
            <button className="bi-btn-ghost" onClick={() => setStep('mapping')}>← Volver</button>
            <button className="bi-btn-primary" onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? 'Importando...' : <><Upload size={14} /> Importar {validRows.length} atleta{validRows.length !== 1 ? 's' : ''}</>}
            </button>
          </div>
        </div>
      )}

      {/* Step: done */}
      {step === 'done' && result && (
        <div className="bi-done-card">
          <div className="bi-done-icon"><Check size={40} /></div>
          <h2>¡Importación completada!</h2>
          <p>{result.inserted ?? result.count ?? validRows.length} atleta{(result.inserted ?? result.count ?? validRows.length) !== 1 ? 's' : ''} importado{(result.inserted ?? result.count ?? validRows.length) !== 1 ? 's' : ''} correctamente.</p>
          <div className="bi-done-actions">
            <button className="bi-btn-ghost" onClick={reset}><RefreshCw size={14} /> Nueva importación</button>
            <button className="bi-btn-primary" onClick={() => navigate('/admin/athletes')}>
              <Users size={14} /> Ver registro de atletas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
