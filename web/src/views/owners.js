import { api } from '../api.js';

// Owner administration (staff): list, review profile data, pets and
// notification preferences. Read-only here; profile edits belong to the
// owner (app) or the staff PATCH endpoint used from the patient file.
const PREF_LABEL = {
  push_enabled: 'Push',
  email_enabled: 'Correo',
  appointment_reminders: 'Recordatorios de citas',
  vaccination_reminders: 'Recordatorios de vacunas',
};

export async function OwnersView(root) {
  root.innerHTML = '<h1>Propietarios</h1><p>Cargando…</p>';
  try {
    const list = await api('/owners');
    const rows = list.owners
      .map(
        (o) =>
          `<tr class="rowlink" data-id="${o.user_id}"><td><strong>${o.display_name}</strong></td><td>${o.email}</td><td>${o.phone || '—'}</td><td>${o.email_verified ? '<span class="badge ok">sí</span>' : '<span class="badge">no</span>'}</td></tr>`,
      )
      .join('');
    root.innerHTML = `
      <h1>Propietarios</h1>
      <p class="subtitle">${list.owners.length} propietarios registrados. Clic para revisar datos, mascotas y preferencias.</p>
      ${rows ? `<table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Verificado</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Sin propietarios.</div>`}
      <h2>Nuevo propietario</h2>
      <form class="inline" id="create">
        <input name="display_name" placeholder="Nombre completo" required />
        <input name="email" type="email" placeholder="Correo (para acceso Google futuro)" />
        <input name="phone" placeholder="Teléfono" />
        <input name="address" placeholder="Dirección" />
        <button>Registrar</button>
      </form>
      <div id="msg"></div>
      <div id="detail"></div>`;
    root.querySelector('#create').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/owners', {
          method: 'POST',
          body: {
            display_name: fd.get('display_name'),
            email: fd.get('email') || null,
            phone: fd.get('phone') || null,
            address: fd.get('address') || null,
          },
        });
        OwnersView(root);
      } catch (err) {
        root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    root.querySelectorAll('.rowlink').forEach((tr) => {
      tr.onclick = async () => {
        const box = root.querySelector('#detail');
        box.innerHTML = '<p>Cargando ficha…</p>';
        try {
          const d = await api(`/owners/${tr.dataset.id}`);
          const prefs = Object.entries(PREF_LABEL)
            .map(([k, label]) => {
              const on = d.preferences && d.preferences[k];
              return `<span class="badge ${on ? 'ok' : ''}">${label}: ${on ? 'sí' : 'no'}</span> `;
            })
            .join('');
          const pets = d.pets
            .map((p) => `<tr><td><a href="#/pacientes/${p.id}">${p.name}</a></td><td>${p.species}</td><td>${p.breed || '—'}</td></tr>`)
            .join('');
          box.innerHTML = `
            <h2>${d.owner.display_name}</h2>
            <div class="cards">
              <div class="card"><div class="label">Contacto</div><div>${d.owner.email}${d.owner.email_verified ? ' <span class="badge ok">verificado</span>' : ''}</div><div>${d.owner.phone || '—'}</div><div>${d.owner.address || ''}</div></div>
              <div class="card"><div class="label">Notificaciones</div><div style="margin-top:.4rem">${prefs}</div></div>
            </div>
            <h2>Mascotas (${d.pets.length})</h2>
            ${pets ? `<table><thead><tr><th>Nombre</th><th>Especie</th><th>Raza</th></tr></thead><tbody>${pets}</tbody></table>` : `<div class="empty">Sin mascotas.</div>`}`;
        } catch (e) {
          box.innerHTML = `<div class="alert error">${e.message}</div>`;
        }
      };
    });
  } catch (e) {
    root.innerHTML = `<h1>Propietarios</h1><div class="alert error">${e.message}</div>`;
  }
}
