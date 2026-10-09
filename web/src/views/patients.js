import { api } from '../api.js';

export async function PatientsView(root) {
  root.innerHTML = '<h1>Pacientes</h1><p>Cargando…</p>';
  try {
    const [pets, owners] = await Promise.all([api('/pets'), api('/owners')]);
    const ownerName = Object.fromEntries(owners.owners.map((o) => [o.user_id, o.display_name]));
    const rows = pets.pets
      .map(
        (p) =>
          `<tr><td><a href="#/pacientes/${p.id}">${p.name}</a></td><td>${p.species}</td><td>${p.breed || '—'}</td><td>${ownerName[p.owner_id] || p.owner_id}</td></tr>`,
      )
      .join('');
    root.innerHTML = `
      <h1>Pacientes</h1>
      ${
        rows
          ? `<table><thead><tr><th>Nombre</th><th>Especie</th><th>Raza</th><th>Propietario</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty">No hay pacientes registrados.</div>`
      }`;
  } catch (e) {
    root.innerHTML = `<h1>Pacientes</h1><div class="alert error">No se pudieron cargar los pacientes: ${e.message}</div>`;
  }
}

export async function PatientDetailView(root, id) {
  root.innerHTML = '<h1>Ficha clínica</h1><p>Cargando…</p>';
  try {
    const [pet, history, meds] = await Promise.all([
      api(`/pets/${id}`),
      api(`/pets/${id}/history`),
      api('/medications'),
    ]);
    const p = pet.pet;
    const age = p.birthdate
      ? Math.floor((Date.now() - new Date(p.birthdate)) / 3.156e10)
      : '—';
    const consults = history.consultations
      .map(
        (c) =>
          `<tr><td>${new Date(c.created_at).toLocaleString()}</td><td>${c.vet_name}</td><td>${c.diagnosis}</td><td>${(c.allergies || []).join(', ') || '—'}</td></tr>`,
      )
      .join('');
    const medOptions = meds.medications
      .map((m) => `<option value="${m.id}">${m.name} — ${(m.price_cents / 100).toFixed(2)} €</option>`)
      .join('');
    root.innerHTML = `
      <h1>${p.name} <span class="badge">${p.species}${p.breed ? ` · ${p.breed}` : ''}</span></h1>
      <div class="cards">
        <div class="card"><div class="label">Edad</div><div class="kpi">${age} años</div></div>
        <div class="card"><div class="label">Peso</div><div class="kpi">${p.weight_kg ?? '—'} kg</div></div>
        <div class="card"><div class="label">Vacunas registradas</div><div class="kpi">${history.vaccinations.length}</div></div>
      </div>
      <h2>Registrar consulta</h2>
      <form class="inline" id="consult">
        <input name="weight_kg" type="number" step="0.1" min="0" placeholder="Peso (kg)" />
        <input name="diagnosis" placeholder="Diagnóstico" required />
        <input name="treatment" placeholder="Tratamiento" />
        <input name="allergies" placeholder="Alergias (coma)" />
        <button>Guardar</button>
      </form>
      <h2>Registrar vacunación</h2>
      <form class="inline" id="vacc">
        <input name="vaccine" placeholder="Vacuna" required />
        <input name="due_date" type="date" required />
        <select name="medication_id"><option value="">Medicamento (opcional)</option>${medOptions}</select>
        <button>Guardar</button>
      </form>
      <div id="msg"></div>
      <h2>Historial clínico</h2>
      ${
        consults
          ? `<table><thead><tr><th>Fecha</th><th>Veterinario</th><th>Diagnóstico</th><th>Alergias</th></tr></thead><tbody>${consults}</tbody></table>`
          : `<div class="empty">Sin consultas registradas.</div>`
      }`;
    const msg = root.querySelector('#msg');
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
        msg.innerHTML = '<div class="alert info">Consulta registrada.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg.innerHTML = `<div class="alert error">${err.message}</div>`;
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
        msg.innerHTML = '<div class="alert info">Vacunación registrada.</div>';
        PatientDetailView(root, id);
      } catch (err) {
        msg.innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
  } catch (e) {
    root.innerHTML = `<h1>Ficha clínica</h1><div class="alert error">No se pudo cargar la ficha: ${e.message}</div>`;
  }
}
