import { api, petPhoto, API_URL, token } from '../api.js';

// Authenticated image: private photos travel with the Bearer token,
// never through public URLs. Falls back to the decorative mockup photo.
async function loadAuthPhoto(img, path, fallback) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error('missing');
    img.src = URL.createObjectURL(await res.blob());
  } catch {
    if (fallback) img.src = fallback;
    else img.style.display = 'none';
  }
}

const SEX_LABEL = { male: 'Macho', female: 'Hembra', unknown: '—' };

// Roman numerals for prescription item numbers (I, II, III…).
function roman(n) {
  const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = n;
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out || '—';
}

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
        const decoy = petPhoto(p.id, p.species);
        return `<div class="pet-card">
          <img ${p.photo_path ? `data-petid="${p.id}" src="${decoy}"` : `src="${decoy}"`} alt="Foto de ${p.name}" loading="lazy" />
          <div class="body">
            <h3>${p.name}</h3>
            <div class="meta">${p.species}${p.breed ? ` · ${p.breed}` : ''}${age !== null ? ` · ${age} años` : ''} · ${ownerName[p.owner_id] || '—'}</div>
            <div class="meta">Sexo: ${SEX_LABEL[p.sex] || '—'}${p.color ? ` · Color: ${p.color}` : ''}</div>
            <div class="meta">Peso: ${p.weight_kg ?? '—'} kg</div>
            <p><a href="#/pacientes/${p.id}"><button>Ver Carnet Clínico</button></a></p>
          </div>
        </div>`;
      })
      .join('');
    root.innerHTML = `
      <h1>Pacientes e Historial</h1>
      <p class="subtitle">${filtered.length} de ${pets.pets.length} pacientes${needle ? ` · filtro: “${q.trim()}”` : ''}.</p>
      ${cards ? `<div class="pet-grid">${cards}</div>` : `<div class="empty">No hay pacientes que coincidan.</div>`}
      <h2>Nueva mascota</h2>
      <form class="inline" id="create">
        <select name="owner_id" required>
          <option value="">Propietario…</option>
          ${owners.owners.map((o) => `<option value="${o.user_id}">${o.display_name}</option>`).join('')}
        </select>
        <input name="name" placeholder="Nombre" required />
        <input name="species" placeholder="Especie (dog, cat…)" required />
        <input name="breed" placeholder="Raza" />
        <input name="color" placeholder="Color (ej. Tricolor: negro, marrón y blanco)" />
        <input name="birthdate" type="date" />
        <select name="sex"><option value="unknown">Sexo…</option><option value="male">Macho</option><option value="female">Hembra</option></select>
        <input name="weight_kg" type="number" step="0.1" min="0" placeholder="Peso (kg)" />
        <button>Registrar</button>
      </form>
      <div id="msg"></div>`;
    // Swap in the real uploaded photo wherever one exists.
    root.querySelectorAll('img[data-petid]').forEach((img) => {
      loadAuthPhoto(img, `/pets/${img.dataset.petid}/photo`);
    });
    root.querySelector('#create').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/pets', {
          method: 'POST',
          body: {
            owner_id: Number(fd.get('owner_id')),
            name: fd.get('name'),
            species: fd.get('species'),
            breed: fd.get('breed') || null,
            color: fd.get('color') || null,
            birthdate: fd.get('birthdate') || null,
            sex: fd.get('sex') || 'unknown',
            weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null,
          },
        });
        PatientsView(root);
      } catch (err) {
        root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
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
      <p class="subtitle">Sexo: <strong>${SEX_LABEL[p.sex] || '—'}</strong>${p.color ? ` · Color: <strong>${p.color}</strong>` : ''}</p>
      <div class="phase"><span class="phase-tag">Datos</span>
        <h2>Editar datos de la mascota</h2>
        <form class="inline" id="pet-edit">
          <input name="name" placeholder="Nombre" value="${(p.name || '').replace(/"/g, '&quot;')}" required />
          <input name="breed" placeholder="Raza" value="${(p.breed || '').replace(/"/g, '&quot;')}" />
          <input name="color" placeholder="Color" value="${(p.color || '').replace(/"/g, '&quot;')}" />
          <input name="birthdate" type="date" value="${p.birthdate || ''}" />
          <select name="sex"><option value="unknown">Sexo…</option><option value="male"${p.sex === 'male' ? ' selected' : ''}>Macho</option><option value="female"${p.sex === 'female' ? ' selected' : ''}>Hembra</option></select>
          <button>Guardar datos</button>
        </form>
      </div>
      <div class="cards">
        <div class="card"><img src="${petPhoto(p.id, p.species)}" alt="Foto de ${p.name}" style="width:100%;height:140px;object-fit:cover;border-radius:12px" /><div class="label" style="margin-top:.5rem">Edad</div><div class="kpi">${age} <small>años</small></div></div>
        <div class="card"><div class="label">Peso actual</div><div class="kpi">${p.weight_kg ?? '—'} <small>kg</small></div><h2 style="font-size:.95rem">Evolución</h2>${sparkline(weight.history)}</div>
        <div class="card"><div class="label">Alergias registradas</div><div style="margin-top:.5rem">${allergies.length ? allergies.map((a) => `<span class="badge bad">${a}</span> `).join('') : '<span class="badge">Sin alergias registradas</span>'}</div></div>
      </div>

      <div class="phase"><span class="phase-tag">Foto</span>
        <h2>Foto registrada</h2>
        <img id="pet-photo" alt="Foto de ${p.name}" style="max-width:280px;border-radius:12px;display:block;margin-bottom:.6rem" />
        <form class="inline" id="photo" enctype="multipart/form-data">
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
          <button>Subir foto (máx. 2 MB)</button>
        </form>
      </div>

      <div class="phase"><span class="phase-tag">Fase 1 · Examen</span>
        <h2>Card 1 · Anamnesis y Diagnóstico</h2>
        <form class="inline" id="consult">
          <input name="weight_kg" type="number" step="0.1" min="0" placeholder="Peso (kg)" />
          <input name="diagnosis" placeholder="Diagnóstico" required style="flex:2;min-width:200px" />
          <input name="treatment" placeholder="Tratamiento" style="flex:2;min-width:200px" />
          <input name="allergies" placeholder="Alergias (coma)" />
          <input name="client_summary" placeholder="Resumen para el cliente (ej. Revisión general…)" style="flex:2;min-width:220px" />
          <input name="internal_notes" placeholder="Notas internas (solo veterinarios)" style="flex:2;min-width:220px" />
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

      <div class="phase"><span class="phase-tag">Exámenes</span>
        <h2>Exámenes de laboratorio (PDF)</h2>
        <p class="subtitle">El laboratorio entrega el PDF; el médico lo adjunta y llega al cliente.</p>
        <form class="inline" id="exam" enctype="multipart/form-data">
          <select name="consultation_id" id="exam-consult" required></select>
          <input name="exam" type="file" accept="application/pdf" required />
          <button>Adjuntar PDF (máx. 10 MB)</button>
        </form>
        <div id="exam-list"></div>
      </div>

      <div class="phase"><span class="phase-tag">Receta</span>
        <h2>Receta de medicamentos</h2>
        <p class="subtitle">Una por consulta. Unidades calculadas en el servidor (cantidad × tomas × días).</p>
        <form class="inline" id="presc-meta">
          <select name="consultation_id" id="presc-consult" required></select>
          <input name="recommendations" placeholder="Recomendaciones" style="flex:2;min-width:200px" />
          <input name="warning_signs" placeholder="Signos de alerta" style="flex:2;min-width:200px" />
          <input name="recheck" placeholder="Revisión (ej. En 1 semana)" />
        </form>
        <div id="presc-items"></div>
        <p><button class="secondary" id="presc-add">+ Concepto</button> <button id="presc-save">Emitir receta</button></p>
        <div id="presc-view"></div>
      </div>

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
    root.querySelector('#pet-edit').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/pets/${id}`, {
          method: 'PATCH',
          body: {
            name: fd.get('name'),
            breed: fd.get('breed') || null,
            color: fd.get('color') || null,
            birthdate: fd.get('birthdate') || null,
            sex: fd.get('sex') || 'unknown',
          },
        });
        msg().innerHTML = '<div class="alert info">Datos actualizados.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    loadAuthPhoto(root.querySelector('#pet-photo'), `/pets/${id}/photo`);
    root.querySelector('#photo').onsubmit = async (e) => {
      e.preventDefault();
      const picked = e.target.querySelector('input[type=file]').files[0];
      if (!picked) {
        msg().innerHTML = '<div class="alert error">Elegí un archivo de imagen primero.</div>';
        return;
      }
      try {
        // Straight from the form: field names come from the inputs themselves.
        await api(`/pets/${id}/photo`, { method: 'POST', body: new FormData(e.target) });
        msg().innerHTML = '<div class="alert info">Foto actualizada.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
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
            client_summary: fd.get('client_summary') || null,
            internal_notes: fd.get('internal_notes') || null,
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

    // ---- Lab exams: attach PDF to a consultation, list + download ----
    const consultOptions = history.consultations
      .map((c) => `<option value="${c.id}">#${c.id} · ${new Date(c.created_at).toLocaleDateString('es-CO')} · ${c.diagnosis}</option>`)
      .join('');
    root.querySelector('#exam-consult').innerHTML = consultOptions || '<option value="">Sin consultas todavía</option>';
    root.querySelector('#presc-consult').innerHTML = consultOptions || '<option value="">Sin consultas todavía</option>';
    root.querySelector('#exam').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/consultations/${e.target.consultation_id.value}/exams`, {
          method: 'POST',
          body: new FormData(e.target),
        });
        msg().innerHTML = '<div class="alert info">Examen adjuntado y enviado al cliente.</div>';
        loadExams();
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    async function loadExams() {
      const box = root.querySelector('#exam-list');
      const rows = [];
      for (const c of history.consultations) {
        try {
          const data = await api(`/consultations/${c.id}/exams`);
          for (const x of data.exams) {
            rows.push(`<tr><td>#${c.id} · ${c.diagnosis}</td><td>${x.filename}</td><td>${(x.size_bytes / 1024).toFixed(0)} KB</td><td><button class="secondary" data-exam="${x.id}" data-consult="${c.id}">Descargar</button></td></tr>`);
          }
        } catch {
          // no exams for this consultation: skip silently
        }
      }
      box.innerHTML = rows.length ? `<table><thead><tr><th>Consulta</th><th>Archivo</th><th>Tamaño</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="empty">Sin exámenes adjuntos.</div>';
      box.querySelectorAll('[data-exam]').forEach((b) => {
        b.onclick = async () => {
          try {
            const res = await fetch(`${API_URL}/consultations/${b.dataset.consult}/exams/${b.dataset.exam}`, {
              headers: { Authorization: `Bearer ${token()}` },
            });
            if (!res.ok) throw new Error('No se pudo descargar.');
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = `examen-${b.dataset.consult}-${b.dataset.exam}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            msg().innerHTML = `<div class="alert error">${err.message}</div>`;
          }
        };
      });
    }
    loadExams();

    // ---- Prescriptions: dynamic item rows, server-computed units ----
    const prescBox = root.querySelector('#presc-items');
    function itemRow() {
      const div = document.createElement('div');
      div.className = 'inline';
      div.style.display = 'flex';
      div.style.gap = '0.4rem';
      div.style.flexWrap = 'wrap';
      div.innerHTML = `
        <input name="medication_name" placeholder="Medicamento" required style="flex:2;min-width:140px" />
        <select name="form"><option value="tableta">Tableta</option><option value="capsula">Cápsula</option><option value="suero">Suero</option><option value="crema">Crema</option><option value="jarabe">Jarabe</option><option value="gota">Gotas</option><option value="inyectable">Inyectable</option></select>
        <input name="strength_mg" type="number" step="any" min="0" placeholder="mg" style="width:90px" />
        <input name="administration" placeholder="Administración (ej. 1 cada 24 h con comida)" required style="flex:2;min-width:180px" />
        <input name="qty_per_dose" type="number" step="any" min="0" placeholder="Cant./toma" required style="width:100px" />
        <input name="times_per_day" type="number" min="1" placeholder="Veces/día" required style="width:100px" />
        <input name="duration_days" type="number" min="1" placeholder="Días" required style="width:80px" />`;
      return div;
    }
    prescBox.appendChild(itemRow());
    root.querySelector('#presc-add').onclick = () => prescBox.appendChild(itemRow());
    root.querySelector('#presc-save').onclick = async () => {
      const meta = new FormData(root.querySelector('#presc-meta'));
      const items = [...prescBox.children].map((row) => {
        const g = (n) => row.querySelector(`[name=${n}]`).value;
        return {
          medication_name: g('medication_name'),
          form: g('form'),
          strength_mg: g('strength_mg') ? Number(g('strength_mg')) : null,
          administration: g('administration'),
          qty_per_dose: Number(g('qty_per_dose')),
          times_per_day: Number(g('times_per_day')),
          duration_days: Number(g('duration_days')),
        };
      });
      try {
        const r = await api(`/consultations/${meta.get('consultation_id')}/prescription`, {
          method: 'POST',
          body: {
            recommendations: meta.get('recommendations') || null,
            warning_signs: meta.get('warning_signs') || null,
            recheck: meta.get('recheck') || null,
            items,
          },
        });
        msg().innerHTML = '<div class="alert info">Receta emitida.</div>';
        renderPrescription(r.prescription, meta.get('consultation_id'));
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    async function renderPrescription(p, consultationId) {
      if (!p) {
        try {
          const data = await api(`/consultations/${consultationId}/prescription`);
          p = data.prescription;
        } catch {
          root.querySelector('#presc-view').innerHTML = '<div class="empty">Esta consulta aún no tiene receta.</div>';
          return;
        }
      }
      const rows = p.items
        .map(
          (it) =>
            `<tr><td><strong>${roman(it.item_no)}</strong></td><td>${it.medication_name} (${it.form})${it.strength_mg ? ` ${it.strength_mg} mg` : ''}<br/><small>${it.administration}</small></td><td>#${it.total_units}</td></tr>`,
        )
        .join('');
      root.querySelector('#presc-view').innerHTML = `
        <div class="receipt">
          <div class="receipt-head"><div><div class="receipt-title">RECETA MÉDICA</div>
            <div>Emitida: ${new Date(p.created_at).toLocaleDateString('es-CO')}</div></div></div>
          <div class="receipt-meta">
            <span><strong>Paciente:</strong> ${p.pet_name} (${p.species}${p.breed ? ` · ${p.breed}` : ''})</span>
            <span><strong>Sexo:</strong> ${p.sex === 'male' ? 'Macho' : p.sex === 'female' ? 'Hembra' : '—'}</span>
            <span><strong>Peso:</strong> ${p.weight_kg ?? '—'} kg</span>
            <span><strong>Propietario:</strong> ${p.owner_name}</span>
          </div>
          <table><thead><tr><th>Nº</th><th>Medicamento y administración</th><th>Unidades</th></tr></thead><tbody>${rows}</tbody></table>
          ${p.recommendations ? `<p><strong>Recomendaciones:</strong> ${p.recommendations}</p>` : ''}
          ${p.warning_signs ? `<p><strong>Signos de alerta:</strong> ${p.warning_signs}</p>` : ''}
          ${p.recheck ? `<p><strong>Revisión:</strong> ${p.recheck}</p>` : ''}
          <p><strong>Firma:</strong> ${p.vet_name} · MP ${p.vet_professional_id || '—'}</p>
        </div>`;
    }
    // Show the selected consultation's prescription when it changes.
    root.querySelector('#presc-consult').onchange = (e) => renderPrescription(null, e.target.value);
    if (history.consultations.length) renderPrescription(null, history.consultations[0].id);
  } catch (e) {
    root.innerHTML = `<h1>Ficha clínica</h1><div class="alert error">No se pudo cargar la ficha: ${e.message}</div>`;
  }
}
