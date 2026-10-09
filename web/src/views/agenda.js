import { api } from '../api.js';

const LABEL = {
  scheduled: ['Programada', ''],
  checked_in: ['En consulta', 'warn'],
  done: ['Atendida', 'ok'],
  cancelled: ['Cancelada', 'bad'],
  no_show: ['No asistió', 'bad'],
};

function weekRange(offsetWeeks) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return { from: monday.toISOString(), to: next.toISOString(), monday };
}

export async function AgendaView(root) {
  let offset = 0;
  async function render() {
    const { from, to, monday } = weekRange(offset);
    root.innerHTML = '<h1>Agenda</h1><p>Cargando citas…</p>';
    try {
      const [list, vets] = await Promise.all([
        api(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/vets'),
      ]);
      const rows = list.appointments
        .map((a) => {
          const [label, cls] = LABEL[a.status] || [a.status, ''];
          return `<tr><td>${new Date(a.starts_at).toLocaleString()}</td><td>${a.pet_name}</td><td>${a.reason || '—'}</td><td><span class="badge ${cls}">${label}</span></td></tr>`;
        })
        .join('');
      const vetOptions = vets.vets.map((v) => `<option value="${v.id}">${v.display_name}</option>`).join('');
      root.innerHTML = `
        <h1>Agenda — semana del ${monday.toLocaleDateString()}</h1>
        <form class="inline" id="nav">
          <button type="button" data-nav="-1" class="secondary">‹ Anterior</button>
          <button type="button" data-nav="1" class="secondary">Siguiente ›</button>
        </form>
        ${
          rows
            ? `<table><thead><tr><th>Inicio</th><th>Mascota</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`
            : `<div class="empty">No hay citas esta semana.</div>`
        }
        <h2>Nueva cita</h2>
        <form class="inline" id="create">
          <input name="pet_id" type="number" min="1" placeholder="ID mascota" required />
          <select name="vet_user_id"><option value="">Sin asignar</option>${vetOptions}</select>
          <input name="starts_at" type="datetime-local" required />
          <input name="ends_at" type="datetime-local" required />
          <input name="reason" placeholder="Motivo" />
          <button>Crear</button>
        </form>
        <div id="msg"></div>`;
      root.querySelectorAll('#nav button').forEach((b) => {
        b.onclick = () => {
          offset += Number(b.dataset.nav);
          render();
        };
      });
      root.querySelector('#create').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const msg = root.querySelector('#msg');
        try {
          await api('/appointments', {
            method: 'POST',
            body: {
              pet_id: Number(fd.get('pet_id')),
              vet_user_id: fd.get('vet_user_id') ? Number(fd.get('vet_user_id')) : null,
              starts_at: new Date(fd.get('starts_at')).toISOString(),
              ends_at: new Date(fd.get('ends_at')).toISOString(),
              reason: fd.get('reason') || null,
            },
          });
          msg.innerHTML = '<div class="alert info">Cita creada.</div>';
          render();
        } catch (err) {
          msg.innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    } catch (e) {
      root.innerHTML = `<h1>Agenda</h1><div class="alert error">No se pudo cargar la agenda: ${e.message}</div>`;
    }
  }
  await render();
}
