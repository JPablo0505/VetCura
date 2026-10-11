import { api, cop } from '../api.js';

const STATUS_LABEL = { draft: 'Borrador', issued: 'Emitida', paid: 'Pagada', void: 'Anulada' };

export async function BillingView(root) {
  root.innerHTML = '<h1>Facturación</h1><p>Cargando…</p>';
  try {
    const [invoices, meds] = await Promise.all([api('/invoices'), api('/medications')]);
    const rows = invoices.invoices
      .map((i) => {
        const cls = i.status === 'paid' ? 'ok' : i.status === 'issued' ? 'info' : i.status === 'void' ? 'bad' : '';
        return `<tr><td>${i.number || `#${i.id} borrador`}</td><td>${i.owner_id}</td><td>${cop(i.total_cents)}</td><td><span class="badge ${cls}">${STATUS_LABEL[i.status] || i.status}</span></td>
          <td><button data-view="${i.id}" class="secondary">Ver</button>
          <button data-act="issued" data-id="${i.id}" class="secondary">Emitir y enviar</button>
          <button data-act="paid" data-id="${i.id}" class="secondary">Cobrar</button></td></tr>`;
      })
      .join('');
    const medOptions = meds.medications
      .map((m) => `<option value="${m.id}">${m.name} — ${cop(m.price_cents)}</option>`)
      .join('');
    root.innerHTML = `
      <h1>Facturación</h1>
      <p class="subtitle">Los totales se calculan en el servidor (subtotal + IVA 19%).</p>
      ${rows ? `<table><thead><tr><th>Nº</th><th>Propietario</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No hay facturas todavía.</div>`}
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
        <input name="unit_price_cents" type="number" min="0" placeholder="Precio (centavos; ej. 280000 = $2.800)" />
        <button>Añadir</button>
      </form>
      <div id="msg"></div>
      <div id="print-area"><div id="preview"></div></div>`;
    const msg = () => root.querySelector('#msg');
    root.querySelectorAll('button[data-view]').forEach((b) => {
      b.onclick = async () => {
        const box = root.querySelector('#preview');
        box.innerHTML = '<p>Cargando factura…</p>';
        try {
          const [detail, clinic] = await Promise.all([
            api(`/invoices/${b.dataset.view}`),
            api('/clinic'),
          ]);
          const inv = detail.invoice;
          const c = clinic.clinic;
          const items = inv.items
            .map(
              (it) =>
                `<tr><td>${it.description}</td><td>${it.qty}</td><td>${cop(it.unit_price_cents)}</td><td>${cop(it.line_total_cents)}</td></tr>`,
            )
            .join('');
          box.innerHTML = `
            <div class="receipt" id="receipt">
              <div class="receipt-head">
                <div><div class="receipt-title">VETERINARIO</div><div>${c.name}<br/>NIT: ${c.nit}<br/>${c.address} · ${c.city}</div></div>
                <div class="receipt-number">FACTURA DE VENTA<br/><strong>${inv.number || `#${inv.id} (borrador)`}</strong></div>
              </div>
              <div class="receipt-meta">
                <span><strong>Cliente:</strong> ${inv.owner_name || inv.owner_id}</span>
                <span><strong>Mascota:</strong> ${inv.pet_name || ''}</span>
                <span><strong>Fecha:</strong> ${inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('es-CO') : '—'}</span>
                <span><strong>Estado:</strong> ${STATUS_LABEL[inv.status] || inv.status}</span>
                ${inv.vet_name ? `<span><strong>Atendido por:</strong> ${inv.vet_name}</span>` : ''}
                ${inv.status === 'paid' ? `<span><strong>Método:</strong> ${inv.payment_method || ''} ${inv.paid_at ? new Date(inv.paid_at).toLocaleString('es-CO') : ''}</span>` : ''}
              </div>
              <table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unit.</th><th>Subtotal</th></tr></thead><tbody>${items || '<tr><td colspan="4">Sin conceptos.</td></tr>'}</tbody></table>
              <div class="receipt-totals">
                <div>Sub Total: <strong>${cop(inv.subtotal_cents)}</strong></div>
                <div>IVA (19%): <strong>${cop(inv.tax_cents)}</strong></div>
                <div class="grand">Total a Pagar: <strong>${cop(inv.total_cents)}</strong></div>
              </div>
              <p class="thanks">Gracias por su compra.</p>
              <p><button class="secondary" id="print">Imprimir</button></p>
            </div>`;
          box.querySelector('#print').onclick = () => window.print();
          box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
          msg().innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    });
    root.querySelectorAll('button[data-act]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api(`/invoices/${b.dataset.id}/status`, { method: 'PATCH', body: { status: b.dataset.act } });
          BillingView(root);
        } catch (err) {
          msg().innerHTML = `<div class="alert error">${err.message}</div>`;
        }
      };
    });
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
