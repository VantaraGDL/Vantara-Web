const WHATSAPP_NUMBER = '523315012267';

export function buildOrderMessage(rows, calculation, money) {
    const lines = rows.map(row => `${row.name}\nTalla: ${row.size}\nCantidad: ${row.quantity}\nPrecio unitario: ${row.price === null ? 'Por confirmar' : money(row.price)}`);
    return `Hola, quiero realizar el siguiente pedido:\n\n${lines.join('\n\n')}\n\n${calculation.completePrice ? 'Subtotal' : 'Subtotal conocido'}: ${money(calculation.subtotal)}\n${calculation.discount ? 'Descuento por conjunto: −' + money(calculation.discount) + '\n' : ''}Total final: ${calculation.completePrice ? money(calculation.total) : 'Por confirmar'}`;
}

export function createOrderConfirmation(money) {
    const dialog = document.createElement('dialog');
    dialog.className = 'order-confirmation';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'order-confirm-title');
    dialog.setAttribute('aria-describedby', 'order-confirm-help');
    dialog.innerHTML = '<h2 id="order-confirm-title">Confirma tu pedido</h2><p id="order-confirm-help">Revisa tus prendas antes de continuar a WhatsApp.</p><div class="confirmation-items"></div><div class="confirmation-totals"></div><p class="confirmation-status" role="status"></p><div class="confirmation-actions"><button type="button" class="confirmation-cancel">Cancelar</button><button type="button" class="confirmation-submit">Confirmar pedido</button></div>';
    document.body.append(dialog);
    const cancel = dialog.querySelector('.confirmation-cancel');
    const confirm = dialog.querySelector('.confirmation-submit');
    let opener, message = '', submitted = false, cooldownUntil = 0;
    const append = (parent, tag, text) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        document.body.classList.remove('order-confirmation-open');
        opener?.focus({preventScroll:true});
    });
    confirm.addEventListener('click', () => {
        if (submitted || !dialog.open) return;
        submitted = true; confirm.disabled = true;
        cooldownUntil = Date.now() + 1500;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        // Same-tab navigation avoids popup blockers and multiple WhatsApp windows.
        try { window.location.assign(url); dialog.close(); }
        catch {
            submitted = false; confirm.disabled = false;
            dialog.querySelector('.confirmation-status').textContent = 'No se pudo abrir WhatsApp. Intenta confirmar de nuevo.';
        }
    });
    return (rows, calculation, button) => {
        if (dialog.open || Date.now() < cooldownUntil) return;
        opener = button; submitted = false; confirm.disabled = false;
        message = buildOrderMessage(rows, calculation, money);
        const items = dialog.querySelector('.confirmation-items'); items.replaceChildren();
        for (const row of rows) {
            const card = append(items, 'article', '');
            append(card, 'h3', row.name);
            append(card, 'p', `Talla: ${row.size} · Cantidad: ${row.quantity}`);
            append(card, 'p', `Precio unitario: ${row.price === null ? 'Por confirmar' : money(row.price)}`);
        }
        const totals = dialog.querySelector('.confirmation-totals'); totals.replaceChildren();
        append(totals, 'p', `${calculation.completePrice ? 'Subtotal' : 'Subtotal conocido'}: ${money(calculation.subtotal)}`);
        if (calculation.discount) append(totals, 'p', 'Descuento por conjunto: −' + money(calculation.discount));
        append(totals, 'strong', 'Total final: ' + (calculation.completePrice ? money(calculation.total) : 'Por confirmar'));
        dialog.querySelector('.confirmation-status').textContent = '';
        dialog.showModal(); document.body.classList.add('order-confirmation-open'); cancel.focus();
    };
}
