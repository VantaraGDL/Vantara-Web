import {prepareOrderAttempt} from './orders-api.js?v=orders-public-1';
import {packagePriceLines} from './package-order.js?v=packages-polish-1';
// Presentation only: reuse the calculated amounts without recalculating discounts.
function confirmationSummaryLines(rows, calculation, money) {
    const label = rows.some(row => row.type === 'package') ? 'Subtotal efectivo' : rows.length === 1 ? 'Subtotal' : 'Subtotal del conjunto';
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
    const lines = rows.map(row => row.type === 'package' ? ['Paquete: '+row.package_name, '', ...row.items.map(i => '- '+i.product_name+' — Talla '+i.size), '', ...packagePriceLines(row,money)].join('\n') : `${row.name}\nTalla: ${row.size}\nCantidad: ${row.quantity}\n${priceLines(row,money).join('\n')}`);
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
    let opener, message = '', submitted = false, cooldownUntil = 0, attempt;
    dialog.addEventListener('cancel',event=>{if(submitted)event.preventDefault();});
    const append = (parent, tag, text) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        document.body.classList.remove('order-confirmation-open');
        opener?.focus({preventScroll:true});
    });
    confirm.addEventListener('click', async () => {
        if (submitted || !dialog.open) return;
        submitted = true; confirm.disabled = true; cancel.disabled = true; confirm.textContent = 'Preparando pedido…';
        dialog.querySelector('.confirmation-status').textContent = 'Preparando pedido…';
        const release=()=>{submitted=false;confirm.disabled=false;cancel.disabled=false;confirm.textContent='Confirmar pedido';};
        try {
            await options.beforeConfirm?.();
            const order=await attempt.create();
            render(order.rows,order.calculation);
            message='Pedido Vant’ara\nFolio: '+order.public_code+'\n\n'+buildOrderMessage(order.rows,order.calculation,money);
        }
        catch(e){release();dialog.querySelector('.confirmation-status').textContent=e.message||'No pudimos confirmar el registro del pedido. Intenta nuevamente.';return;}
        if(!dialog.open){release();return;}
        cooldownUntil = Date.now() + 1500;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        // Same-tab navigation avoids popup blockers and multiple WhatsApp windows.
        try { window.location.assign(url); dialog.close(); }
        catch {
            release();
            dialog.querySelector('.confirmation-status').textContent = 'No se pudo abrir WhatsApp. Intenta confirmar de nuevo.';
            return;
        }
        attempt.complete();
        try { options.onWhatsAppOpened?.(); }
        catch {
            submitted = false; confirm.disabled = false;
            dialog.querySelector('.confirmation-status').textContent = 'Se abrió WhatsApp, pero no se pudo limpiar el carrito.';
            window.alert('Se abrió WhatsApp, pero no se pudo vaciar el carrito. Elimínalo manualmente.');
        }
    });
    function render(rows,calculation) {
        const items = dialog.querySelector('.confirmation-items'); items.replaceChildren();
        for (const row of rows) {
            const card = append(items, 'article', '');
            if (row.type === 'package') {
                card.className='confirmation-package';
                append(card, 'h3', 'Paquete: '+row.package_name);
                const included=append(card,'ul','');
                for (const item of row.items) append(included, 'li', item.product_name+' — Talla '+item.size);
                for (const line of packagePriceLines(row,money)) append(card, 'p', line);
                continue;
            }
            append(card, 'h3', row.name);
            append(card, 'p', `Talla: ${row.size} · Cantidad: ${row.quantity}`);
            for (const line of priceLines(row,money)) append(card, 'p', line);
        }
        const totals = dialog.querySelector('.confirmation-totals'); totals.replaceChildren();
        const summaryLines=confirmationSummaryLines(rows,calculation,money);
        summaryLines.forEach((line,index)=>append(totals,index===summaryLines.length-1?'strong':'p',line));
    }
    return (rows, calculation, button) => {
        if (dialog.open || Date.now() < cooldownUntil) return;
        opener=button;submitted=false;confirm.disabled=false;cancel.disabled=false;confirm.textContent='Confirmar pedido';
        render(rows,calculation);
        dialog.querySelector('.confirmation-status').textContent = '';
        try { attempt=prepareOrderAttempt(options.source||'product',rows); }
        catch(error) {
            attempt=null;confirm.disabled=true;
            dialog.querySelector('.confirmation-status').textContent=error.message||'No pudimos preparar el pedido. Cierra esta ventana e intenta nuevamente.';
        }
        dialog.showModal(); document.body.classList.add('order-confirmation-open'); cancel.focus();
    };
}
