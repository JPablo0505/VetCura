import { api, petPhoto } from '../api.js';

export async function PatientsView(root, q = '') {
  root.innerHTML = '<h1>Pacientes e Historial</h1><p>Cargando…</p>';
  try {
    const [pets, owners] = await Promise.all([api('/pets'), api('/owners')]);
    const ownerName = Object.fromEntries(owners.owners.map((o) => [o.user_id, o.display_name]));
    const needle = q.trim().toLowerCase();
    const filtered = pets.pets.filter(
      (p) =>
        !needle ||
        p.name.toLowerCase().includes(needle) ||
        (p.breed || '').toLowerCase().includes(needle) ||
        (ownerName[p.owner_id] || '').toLowerCase().includes(needle),
    );
    const cards = filtered
      .map((p) => {
        const age = p.birthdate ? Math.floor((Date.now() - new Date(p.birthdate)) / 3.156e10) : null;
        return `<div class="pet-card">
          <img src="${petPhoto(p.id, p.species)}" alt="Foto de ${p.name}" loading="lazy" />
          <div class="body">
            <h3>${p.name}</h3>
            <div class="meta">${p.species}${p.breed ? ` · ${p.breed}` : ''}${age !== null ? ` · ${age} años` : ''} · ${ownerName[p.owner_id] || '—'}</div>
            <div class="meta">Peso: ${p.weight_kg ?? '—'} kg</div>
            <p><a href="#/pacientes/${p.id}"><button>Ver Carnet Clínico</button></a></p>
          </div>
        </div>`;
      })
      .join('');
    root.innerHTML = `
      <h1>Pacientes e Historial</h1>
      <p class="subtitle">${filtered.length} de ${pets.pets.length} pacientes${needle ? ` · filtro: “${q.trim()}”` : ''}.</p>
      ${cards ? `<div class="pet-grid">${cards}</div>` : `<div class="empty">No hay pacientes que coincidan.</div>`}`;
  } catch (e) {
    root.innerHTML = `<h1>Pacientes e Historial</h1><div class="alert error">No se pudieron cargar los pacientes: ${e.message}</div>`;
  }
}

function sparkline(points) {
  if (points.length === 0) return '<div class="empty">Sin registros de peso.</div>';
  const w = 260;
  const h = 90;
  const pad = 12;
  const vals = points.map((p) => p.weight_kg);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = points.length === 1 ? 0 : (w - pad * 2) / (points.length - 1);
  const dots = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = h - pad - ((p.weight_kg - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = points[points.length - 1];
  return `<svg width="${w}" height="${h}" role="img" aria-label="Evolución de peso">
    <polyline points="${dots}" fill="none" stroke="#00685f" stroke-width="2.5" stroke-linecap="round"/>
    ${points.map((p, i) => {
      const x = pad + i * step;
      const y = h - pad - ((p.weight_kg - min) / span) * (h - pad * 2);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#00685f"><title>${p.date}: ${p.weight_kg} kg</title></circle>`;
    }).join('')}
  </svg>
  <div><strong>${last.weight_kg} kg</strong> (${last.date})</div>`;
}

export async function PatientDetailView(root, id) {
  root.innerHTML = '<h1>Ficha clínica</h1><p>Cargando…</p>';
  try {
    const [pet, history, weight, meds] = await Promise.all([
      api(`/pets/${id}`),
      api(`/pets/${id}/history`),
      api(`/pets/${id}/weight-history`),
      api('/medications'),
    ]);
    const p = pet.pet;
    const age = p.birthdate ? Math.floor((Date.now() - new Date(p.birthdate)) / 3.156e10) : '—';
    const consults = history.consultations
      .map(
        (c) =>
          `<tr><td>${new Date(c.created_at).toLocaleString('es-CO')}</td><td>${c.vet_name}</td><td>${c.diagnosis}</td><td>${(c.allergies || []).join(', ') || '—'}</td></tr>`,
      )
      .join('');
    const vaccs = history.vaccinations
      .map(
        (v) =>
          `<tr><td>${v.vaccine}</td><td>${v.due_date}</td><td>${
            v.given_date ? `<span class="badge ok">Aplicada ${v.given_date}</span>` : '<span class="badge warn">Pendiente</span>'
          }</td></tr>`,
      )
      .join('');
    const allergies = [...new Set(history.consultations.flatMap((c) => c.allergies || []))];
    root.innerHTML = `
      <p><a href="#/pacientes">‹ Volver a pacientes</a></p>
      <h1>${p.name} <span class="badge info">${p.species}${p.breed ? ` · ${p.breed}` : ''}</span></h1>
      <p class="subtitle">Consulta clínica: anamnesis, tratamiento y liquidación. Guardar la ficha la hace visible de inmediato en la app móvil del propietario.</p>
      <div class="cards">
        <div class="card"><img src="${petPhoto(p.id, p.species)}" alt="Foto de ${p.name}" style="width:100%;height:140px;object-fit:cover;border-radius:12px" /><div class="label" style="margin-top:.5rem">Edad</div><div class="kpi">${age} <small>años</small></div></div>
        <div class="card"><div class="label">Peso actual</div><div class="kpi">${p.weight_kg ?? '—'} <small>kg</small></div><h2 style="font-size:.95rem">Evolución</h2>${sparkline(weight.history)}</div>
        <div class="card"><div class="label">Alergias registradas</div><div style="margin-top:.5rem">${allergies.length ? allergies.map((a) => `<span class="badge bad">${a}</span> `).join('') : '<span class="badge">Sin alergias registradas</span>'}</div></div>
      </div>

      <div class="phase"><span class="phase-tag">Fase 1 · Examen</span>
        <h2>Card 1 · Anamnesis y Diagnóstico</h2>
        <form class="inline" id="consult">
          <input name="weight_kg" type="number" step="0.1" min="0" placeholder="Peso (kg)" />
          <input name="diagnosis" placeholder="Diagnóstico" required style="flex:2;min-width:200px" />
          <input name="treatment" placeholder="Tratamiento" style="flex:2;min-width:200px" />
          <input name="allergies" placeholder="Alergias (coma)" />
          <button>Guardar Ficha y Enviar a App Móvil</button>
        </form>
      </div>

      <div class="phase"><span class="phase-tag">Fase 2 · Terapéutica</span>
        <h2>Card 2 · Vacunación</h2>
        <form class="inline" id="vacc">
          <input name="vaccine" placeholder="Vacuna" required />
          <input name="due_date" type="date" required />
          <button>Registrar</button>
        </form>
      </div>

      <div id="msg"></div>

      <div class="phase"><span class="phase-tag">Fase 3 · Cierre</span>
        <h2>Card 3 · Liquidación</h2>
        <p class="subtitle">Crea el borrador y suma conceptos en <a href="#/facturacion">Facturación</a>; los totales los calcula el servidor (IVA 19%).</p>
        <p><button class="accent" id="draft">Crear Factura Borrador</button></p>
      </div>

      <h2>Historial clínico cronológico</h2>
      ${consults ? `<table><thead><tr><th>Fecha</th><th>Veterinario</th><th>Diagnóstico</th><th>Alergias</th></tr></thead><tbody>${consults}</tbody></table>` : `<div class="empty">Sin consultas registradas.</div>`}
      <h2>Vacunaciones</h2>
      ${vaccs ? `<table><thead><tr><th>Vacuna</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${vaccs}</tbody></table>` : `<div class="empty">Sin vacunaciones registradas.</div>`}`;
    const msg = () => root.querySelector('#msg');
    root.querySelector('#consult').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/consultations', {
          method: 'POST',
          body: {
            pet_id: Number(id),
            weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null,
            diagnosis: fd.get('diagnosis'),
            treatment: fd.get('treatment') || null,
            allergies: (fd.get('allergies') || '').split(',').map((s) => s.trim()).filter(Boolean),
          },
        });
        msg().innerHTML = '<div class="alert info">Ficha guardada y visible en la app móvil del propietario.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    root.querySelector('#vacc').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/vaccinations', {
          method: 'POST',
          body: { pet_id: Number(id), vaccine: fd.get('vaccine'), due_date: fd.get('due_date') },
        });
        msg().innerHTML = '<div class="alert info">Vacunación registrada.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    root.querySelector('#draft').onclick = async () => {
      try {
        const r = await api('/invoices', { method: 'POST', body: { pet_id: Number(id) } });
        msg().innerHTML = `<div class="alert info">Borrador #${r.invoice.id} creado. Sumá conceptos en <a href="#/facturacion">Facturación</a>.</div>`;
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
  } catch (e) {
    root.innerHTML = `<h1>Ficha clínica</h1><div class="alert error">No se pudo cargar la ficha: ${e.message}</div>`;
  }
}
