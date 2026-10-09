import { api, euros } from '../api.js';

export async function BillingView(root) {
  root.innerHTML = '<h1>Facturación</h1><p>Cargando…</p>';
  try {
    const [invoices, meds] = await Promise.all([api('/invoices'), api('/medications')]);
    const rows = invoices.invoices
      .map(
        (i) =>
          `<tr><td>#${i.id}</td><td>${i.owner_id}</td><td>${euros(i.total_cents)}</td><td><span class="badge">${i.status}</span></td>
           <td><button data-act="issue" data-id="${i.id}" class="secondary">Emitir</button>
           <button data-act="pay" data-id="${i.id}" class="secondary">Cobrar</button></td></tr>`,
      )
      .join('');
    const medOptions = meds.medications
      .map((m) => `<option value="${m.id}">${m.name} — ${euros(m.price_cents)}</option>`)
      .join('');
    root.innerHTML = `
      <h1>Facturación</h1>
      ${
        rows
          ? `<table><thead><tr><th>Nº</th><th>Propietario</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<div class="empty">No hay facturas todavía.</div>`
      }
      <h2>Nueva factura</h2>
      <form class="inline" id="create">
        <input name="pet_id" type="number" min="1" placeholder="ID mascota" required />
        <button>Crear borrador</button>
      </form>
      <h2>Añadir concepto</h2>
      <form class="inline" id="item">
        <input name="invoice_id" type="number" min="1" placeholder="ID factura" required />
        <select name="medication_id"><option value="">Concepto libre</option>${medOptions}</select>
        <input name="description" placeholder="Descripción" required />
        <input name="qty" type="number" min="1" value="1" required />
        <input name="unit_price_cents" type="number" min="0" placeholder="Precio (cént.)" />
        <button>Añadir</button>
      </form>
      <div id="msg"></div>
      <p class="empty">Los totales se calculan en el servidor (subtotal + ${Math.round(Number(import.meta.env.VITE_TAX_HINT || 10))}% IVA).</p>`;
    root.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = async () => {
        const msg = root.querySelector('#msg');
        try {
          await api(`/invoices/${b.dataset.id}/status`, {
            method: 'PATCH',
            body: { status: b.dataset.act === 'issue' ? 'issued' : 'paid' },
          });
          BillingView(root);
        } catch (err) {
          msg.innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    });
    const msg = () => root.querySelector('#msg');
    root.querySelector('#create').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/invoices', { method: 'POST', body: { pet_id: Number(fd.get('pet_id')) } });
        BillingView(root);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
    root.querySelector('#item').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/invoices/${fd.get('invoice_id')}/items`, {
          method: 'POST',
          body: {
            medication_id: fd.get('medication_id') ? Number(fd.get('medication_id')) : null,
            description: fd.get('description'),
            qty: Number(fd.get('qty')),
            unit_price_cents: fd.get('unit_price_cents') ? Number(fd.get('unit_price_cents')) : null,
          },
        });
        BillingView(root);
      } catch (err) {
        msg().innerHTML = `<div class="alert error">${err.message}</div>`;
      }
    };
  } catch (e) {
    root.innerHTML = `<h1>Facturación</h1><div class="alert error">No se pudo cargar la facturación: ${e.message}</div>`;
  }
}
