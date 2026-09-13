// Presentation only: reuse the calculated amounts without recalculating discounts.
function confirmationSummaryLines(rows, calculation, money) {
    const label = rows.length === 1 ? 'Subtotal' : 'Subtotal del conjunto';
    return [
        `${label}${calculation.completePrice ? '' : ' conocido'}: ${money(calculation.effectiveSubtotal)}`,
        ...(calculation.collectionDiscountTotal > 0 ? ['Descuento de colección: −' + money(calculation.collectionDiscountTotal)] : []),
        'Total final: ' + (calculation.completePrice ? money(calculation.finalTotal) : 'Por confirmar')
    ];
}
const WHATSAPP_NUMBER = '523315012267';

function priceLines(row,money) {
    if(row.individualSaleApplied)return [
        `Precio original: ${money(row.originalPrice)}`,
        `Descuento: ${row.discountPercent}%`,
        `Precio final: ${money(row.price)}`
    ];
    return [`Precio unitario: ${row.price === null ? 'Por confirmar' : money(row.price)}`];
}

export function buildOrderMessage(rows, calculation, money) {
    const lines = rows.map(row => `${row.name}\nTalla: ${row.size}\nCantidad: ${row.quantity}\n${priceLines(row,money).join('\n')}`);
    return `Hola, quiero realizar el siguiente pedido:\n\n${lines.join('\n\n')}\n\n${confirmationSummaryLines(rows,calculation,money).join('\n')}`;
}

export function createOrderConfirmation(money, options = {}) {
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
    confirm.addEventListener('click', async () => {
        if (submitted || !dialog.open) return;
        submitted = true; confirm.disabled = true;
        try { await options.beforeConfirm?.(); }
        catch(e){submitted=false;confirm.disabled=false;dialog.querySelector('.confirmation-status').textContent=e.message||'No se pudo validar el pedido. Reintenta.';return;}
        if(!dialog.open){submitted=false;confirm.disabled=false;return;}
        cooldownUntil = Date.now() + 1500;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        // Same-tab navigation avoids popup blockers and multiple WhatsApp windows.
        try { window.location.assign(url); dialog.close(); }
        catch {
            submitted = false; confirm.disabled = false;
            dialog.querySelector('.confirmation-status').textContent = 'No se pudo abrir WhatsApp. Intenta confirmar de nuevo.';
            return;
        }
        try { options.onWhatsAppOpened?.(); }
        catch {
            submitted = false; confirm.disabled = false;
            dialog.querySelector('.confirmation-status').textContent = 'Se abrió WhatsApp, pero no se pudo limpiar el carrito.';
            window.alert('Se abrió WhatsApp, pero no se pudo vaciar el carrito. Elimínalo manualmente.');
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
            for (const line of priceLines(row,money)) append(card, 'p', line);
        }
        const totals = dialog.querySelector('.confirmation-totals'); totals.replaceChildren();
        const summaryLines=confirmationSummaryLines(rows,calculation,money);
        summaryLines.forEach((line,index)=>append(totals,index===summaryLines.length-1?'strong':'p',line));
        dialog.querySelector('.confirmation-status').textContent = '';
        dialog.showModal(); document.body.classList.add('order-confirmation-open'); cancel.focus();
    };
}
