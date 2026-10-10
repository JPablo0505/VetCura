import { api } from '../api.js';

const STATUS_LABEL = {
  scheduled: 'Pendiente',
  checked_in: 'En consulta',
  done: 'Atendida',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
};

const NEXT = { scheduled: 'checked_in', checked_in: 'done' };
const NEXT_LABEL = { checked_in: 'Iniciar consulta', done: 'Finalizar' };

// Módulo de Consulta: the operational screen of the day. Today's
// appointments with direct access to each clinical file and one-click
// status advance. The archive (all patients, history, registrations)
// lives in Pacientes e Historial.
export async function ConsultView(root) {
  root.innerHTML = '<h1>Módulo de Consulta</h1><p>Cargando el día…</p>';
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 864e5);
    const [list, vets] = await Promise.all([
      api(`/appointments?from=${start.toISOString()}&to=${end.toISOString()}`),
      api('/vets'),
    ]);
    const vetName = Object.fromEntries(vets.vets.map((v) => [v.id, v.display_name]));
    const mine = list.appointments.filter((a) => ['scheduled', 'checked_in', 'done'].includes(a.status));
    const counts = {
      scheduled: mine.filter((a) => a.status === 'scheduled').length,
      checked_in: mine.filter((a) => a.status === 'checked_in').length,
      done: mine.filter((a) => a.status === 'done').length,
    };
    const rows = mine
      .map((a) => {
        const next = NEXT[a.status];
        return `<tr>
          <td>${new Date(a.starts_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
          <td><a href="#/pacientes/${a.pet_id}"><strong>${a.pet_name}</strong></a></td>
          <td>${a.reason || '—'}</td>
          <td>${vetName[a.vet_user_id] || 'Sin asignar'}</td>
          <td><span class="badge ${a.status === 'done' ? 'ok' : a.status === 'checked_in' ? 'warn' : ''}">${STATUS_LABEL[a.status]}</span></td>
          <td>${next ? `<button data-id="${a.id}" data-next="${next}" class="secondary">${NEXT_LABEL[next]}</button>` : '—'}</td>
        </tr>`;
      })
      .join('');
    root.innerHTML = `
      <h1>Módulo de Consulta</h1>
      <p class="subtitle">Turno de hoy: ${counts.scheduled} pendientes · ${counts.checked_in} en consulta · ${counts.done} atendidas.</p>
      ${rows ? `<table><thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Veterinario</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No hay consultas para hoy. Agendalas desde la Agenda Semanal.</div>`}
      <div id="msg"></div>`;
    root.querySelectorAll('button[data-id]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api(`/appointments/${b.dataset.id}/status`, {
            method: 'PATCH',
            body: { status: b.dataset.next },
          });
          ConsultView(root);
        } catch (err) {
          root.querySelector('#msg').innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    });
  } catch (e) {
    root.innerHTML = `<h1>Módulo de Consulta</h1><div class="alert error">No se pudo cargar el día: ${e.message}</div>`;
  }
}
