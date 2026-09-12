import {createOrderConfirmation} from './order-confirmation.js?v=whatsapp-2';
import {catalogApi} from './catalog-api.js?v=supabase-2';
import {escapeHTML,getPublicVariants,productSizes,sizeUnavailable,variantStock,knownPrice,quantityLimit,calculateOrder as orderTotals} from './catalog-logic.js?v=badges-1';
import {getProductImages,createProductCard} from './product-ui.js?v=badges-1';
let products=[],product;
const productDetail =
    document.querySelector("#product-detail");

const relatedSection =
    document.querySelector("#related-section");

const relatedProducts =
    document.querySelector("#related-products");

const productError =
    document.querySelector("#product-error");


const params =
    new URLSearchParams(window.location.search);


const productId =
    Number(params.get("id"));


const orderSelection = new Map();
async function loadProduct() {
    productDetail.hidden=true;relatedSection.hidden=true;productError.hidden=false;
    productError.querySelector('h1').textContent='Cargando producto…';
    productError.querySelector('p').textContent='';
    try {
        products=await catalogApi.loadProducts();
        product=products.find(p=>p.id===productId);
        if(!product){
            document.title="Producto no encontrado | Vant'ara";
            const robots=document.createElement('meta');robots.name='robots';robots.content='noindex';document.head.appendChild(robots);
            productError.querySelector('h1').textContent='Producto no encontrado';
            productError.querySelector('p').textContent='El producto que buscas no existe o ya no está disponible.';
            return;
        }
        orderSelection.set(product.id,{size:null,quantity:1});
        productError.hidden=true;productDetail.hidden=false;relatedSection.hidden=false;
        renderProduct(product);renderRelatedProducts(product);
        if(products.some(p=>p.imageError))document.querySelector('#order-error').textContent='Algunas imágenes no pudieron cargarse. Puedes recargar para reintentar.';
    }catch{
        productDetail.hidden=true;relatedSection.hidden=true;productError.hidden=false;productError.setAttribute('role','alert');
        productError.querySelector('h1').textContent='No se pudo cargar el producto';
        productError.querySelector('p').textContent='Revisa tu conexión y recarga la página para reintentar.';
    }
}
loadProduct();

function initialSelection(item) {
    const variants = getPublicVariants(item);
    const single = variants.length === 1 ? variants[0] : null;
    return {size: single?.size === 'Única' && single.stock > 0 ? single.size : null, quantity: 1};
}

function renderProduct(product) {
    orderSelection.clear();
    orderSelection.set(product.id, initialSelection(product));
    document.querySelector(".back-link").href = "catalogo.html?category=" + encodeURIComponent(product.category);

    const images =
        product.images && product.images.length > 0
            ? product.images
            : [
            "assets/img/producto-pendiente.svg"
            ];


    const price = knownPrice(product)
        ? `$${product.price} MXN`
        : "Precio próximamente";


    const sizesHTML =
        createSizes(product);


    productDetail.innerHTML = `

       
        <div class="product-gallery">

            <div class="product-main-image">

                <img
                id="main-product-image"
                src="${escapeHTML(images[0])}"
                alt="${escapeHTML(product.name || product.model)}"
                >

            </div>

            <div class="product-thumbnails">

                ${images.map((image, index) => `
                    <button
                        class="thumbnail-button ${index === 0 ? "active" : ""}"
                        data-image="${escapeHTML(image)}"
                        aria-label="Ver imagen ${index + 1}"
                        aria-pressed="${index === 0}"
                    >
                        <img
                            src="${escapeHTML(image)}"
                            alt="Vista ${index + 1}"
                        >
                    </button>
                `).join("")}

            </div>

        </div>


        <div class="product-data">

            <p class="product-brand-detail">
                ${escapeHTML(product.brand)}
            </p>


            <h1>
                ${escapeHTML(product.name || product.model)}
            </h1>


            <p class="product-price-detail">
                ${price}
            </p>


            <div class="product-options">
                <div class="product-option">
                    <p class="product-option-label">Material</p>
                    <p class="product-option-value">
                        ${escapeHTML(product.material?.trim() || "Pendiente")}
                    </p>
                </div>

                <div class="product-option">
                    <p class="product-option-label">Talla</p>
                    <div class="size-quantity-row"><div class="size-list" data-sizes-for="${product.id}">${sizesHTML}</div>${renderQuantity(product)}</div>
                    <p id="stock-status" class="stock-status" role="status" ${sizesHTML ? "" : "hidden"}>
                        Selecciona una talla
                    </p>
                </div>
            </div>


            ${renderCollection(product)}

            <details class="product-description">
                <summary><h2>Descripción</h2><span class="accordion-icon" aria-hidden="true"></span></summary>
                <p>
                    ${product.description?.trim() && !/^[.\s…]+$/.test(product.description)
                        ? escapeHTML(product.description)
                        : "Descripción pendiente."}
                </p>
            </details>

        </div>
        <aside class="order-panel" aria-label="Resumen de tu pedido">
            <h2>Tu pedido</h2>
            <div id="order-summary" class="outfit-summary" aria-live="polite"></div>

            <p id="order-error" role="alert" class="order-error"></p>
            <button
                id="contact-button"
                class="product-action"
            >
                Pedir producto
            </button>


        </aside>
    `;


    document.title = `${product.name || product.model} | Vant'ara`;
    document.querySelector('meta[name="description"]').content = `${product.name || product.model}. Consulta sus detalles, tallas y disponibilidad en Vant'ara.`;

    setupSizeButtons();
    setupCollection();
    setupQuantities();
    document.querySelectorAll('.size-button').forEach(button => {
        const id = Number(button.closest('[data-sizes-for]').dataset.sizesFor);
        const active = button.dataset.size === orderSelection.get(id)?.size;
        button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
    });
    if (orderSelection.get(product.id).size) document.querySelector('#stock-status').textContent = 'Talla seleccionada: ' + orderSelection.get(product.id).size;

    setupContactButton(product);
    setupGallery();
    setupImageViewer();
}

function money(value) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value) + " MXN";
}

function createSizes(item) {
    return productSizes(item).map(size => `
        <button type="button" class="size-button" aria-pressed="false" data-size="${escapeHTML(size)}"
            ${sizeUnavailable(item, size) ? 'disabled title="Talla agotada"' : ''}>${escapeHTML(size === 'Única' ? 'Unitalla' : size)}</button>
    `).join("");
}

function renderCollection(current) {
    if (!current.collection) return "";
    const members = products.filter(p => p.id !== current.id && p.collection === current.collection);
    if (members.length === 0) return "";
    const title = current.collectionName;
    return `<section class="outfit" aria-labelledby="outfit-title">
        <h2 id="outfit-title">Arma tu conjunto — ${escapeHTML(title)}</h2>
        <p class="outfit-hint">Agrega otras prendas si quieres completar tu conjunto. El total incluye el producto actual.</p>
        <div class="outfit-list">${members.map((item, index) => `
            <article class="outfit-card" data-outfit-id="${item.id}" data-original-order="${index}">
                <img src="${escapeHTML(getProductImages(item)[0] || 'assets/img/producto-pendiente.svg')}" alt="${escapeHTML(item.name || item.model)}">
                <div class="outfit-info">
                    <label><input type="checkbox" data-outfit-select="${item.id}">
                        <span>${escapeHTML(item.name || item.model)}</span></label>
                    <p>${knownPrice(item) ? money(item.price) : 'Precio por confirmar'}</p>
                    <fieldset data-sizes-for="${item.id}" hidden>
                        <legend>Talla — ${escapeHTML(item.name || item.model)}</legend>
                        <div class="size-quantity-row"><div class="size-list">${createSizes(item)}</div>${renderQuantity(item)}</div>
                    </fieldset>
                </div>
            </article>`).join("")}</div>

    </section>`;
}

function updateOrderSummary() {
    const selected = products.filter(p => orderSelection.has(p.id));
    const pieces = selected.reduce((sum, p) => sum + orderSelection.get(p.id).quantity, 0);
    const valid = selected.every(p => Number.isSafeInteger(orderSelection.get(p.id).quantity) && orderSelection.get(p.id).quantity > 0 && orderSelection.get(p.id).quantity <= quantityLimit(p, orderSelection.get(p.id).size));
    document.querySelectorAll("#outfit-summary, #order-summary").forEach(summary => {
        const { completePrice, subtotal, discount, total } = calculateOrder(selected);
        summary.textContent = !valid ? "Revisa las cantidades: de 1 a 5 piezas por producto, según disponibilidad." : `${pieces} ${pieces === 1 ? "pieza" : "piezas"} · ${selected.length} ${selected.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}\n${discount ? 'Descuento por conjunto: −' + money(discount) + '\n' : ''}${completePrice ? 'Total: ' + money(total) : 'Subtotal conocido: ' + money(subtotal) + ' · Total por confirmar'}`;
    });
    document.querySelector("#contact-button").disabled = selected.length === 0;
    document.querySelector("#order-error").textContent = "";
}

function setupCollection() {
    document.querySelectorAll('[data-outfit-select]').forEach(input => {
        input.addEventListener('change', () => {
            const id = Number(input.dataset.outfitSelect);
            if (input.checked) orderSelection.set(id, initialSelection(products.find(p => p.id === id)));
            else orderSelection.delete(id);
            document.querySelectorAll(`[data-sizes-for="${id}"]`).forEach(group => {
                group.hidden = !input.checked;
                group.querySelectorAll('.size-button').forEach(button => {
                    const active = button.dataset.size === orderSelection.get(id)?.size;
                    button.classList.toggle('selected', active);
                    button.setAttribute('aria-pressed', String(active));
                });
            });
            const quantityInput = document.querySelector(`[data-quantity-for="${id}"]`);
            if (quantityInput) { quantityInput.value = 1; quantityInput.removeAttribute("max"); }
            syncQuantityLimit(products.find(p => p.id === id));
            moveCollectionCard(input);
            updateOrderSummary();
        });
    });
    updateOrderSummary();
}

function setupSizeButtons() {
    document.querySelectorAll('[data-sizes-for]').forEach(group => {
        const id = Number(group.dataset.sizesFor);
        const item = products.find(p => p.id === id);
        group.querySelectorAll('.size-button').forEach(button => {
            button.addEventListener('click', () => {
                if (!orderSelection.has(id) || sizeUnavailable(item, button.dataset.size)) return;
                const selection = orderSelection.get(id);
                if (selection.size !== button.dataset.size) selection.quantity = 1;
                selection.size = button.dataset.size;
                document.querySelectorAll(`[data-sizes-for="${id}"] .size-button`).forEach(option => {
                    const active = option.dataset.size === button.dataset.size;
                    option.classList.toggle('selected', active);
                    option.setAttribute('aria-pressed', String(active));
                });
                if (id === product.id) document.querySelector('#stock-status').textContent = `Talla seleccionada: ${button.dataset.size}`;
                syncQuantityLimit(item);
                updateOrderSummary();
            });
        });
    });
}

function setupContactButton() {
    const openConfirmation = createOrderConfirmation(money);
    document.querySelector('#contact-button').addEventListener('click', () => {
        const selected = products.filter(p => orderSelection.has(p.id));
        const error = document.querySelector('#order-error');
        if (!selected.length) { error.textContent = 'Selecciona al menos una prenda.'; return; }
        for (const item of selected) {
            const { size, quantity } = orderSelection.get(item.id);
            if (!getPublicVariants(item).some(v => v.size === size && v.stock > 0)) {
                error.textContent = `Selecciona una talla disponible para ${item.name || item.model}.`;
                document.querySelector(`[data-sizes-for="${item.id}"] .size-button:not(:disabled)`)?.focus();
                return;
            }
            const limit = quantityLimit(item, size);
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit) {
                error.textContent = `Revisa la cantidad de ${item.name || item.model}. ${quantity > 5 ? "El máximo es de 5 piezas por producto." : quantity > limit ? "Supera las piezas disponibles para esta talla." : "Debe ser un número entero mayor que cero."}`;
                document.querySelector(`[data-quantity-for="${item.id}"]`)?.focus();
                return;
            }
            if (productSizes(item).length && (!size || sizeUnavailable(item, size))) {
                error.textContent = `Selecciona una talla disponible para ${item.name || item.model}.`;
                const group = [...document.querySelectorAll(`[data-sizes-for="${item.id}"]`)].find(el => el.getClientRects().length);
                group?.querySelector('.size-button:not(:disabled)')?.focus();
                return;
            }
            if (typeof item.stock === 'number' && item.stock <= 0) {
                error.textContent = `${item.name || item.model} está agotado.`; return;
            }
        }
        const rows = selected.map(item => {
            const { size, quantity } = orderSelection.get(item.id);
            return {name: item.name || item.model, size: size || item.variants?.[0]?.size || 'No requiere talla', quantity, price: knownPrice(item) ? item.price : null};
        });
        openConfirmation(rows, calculateOrder(selected), document.querySelector('#contact-button'));
    });
}

function setupGallery() {

    const mainImage =
        document.querySelector("#main-product-image");

    const thumbnails =
        document.querySelectorAll(".thumbnail-button");


    thumbnails.forEach(button => {

        button.addEventListener("click", () => {

            mainImage.src =
                button.dataset.image;


            thumbnails.forEach(thumbnail => {
                thumbnail.classList.remove("active");
                thumbnail.setAttribute("aria-pressed", "false");
            });


            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");

        });

    });

}

function renderRelatedProducts(currentProduct) {

    const related =
        products
            .filter(product =>
                product.id !== currentProduct.id &&
                (
                    product.category === currentProduct.category ||
                    product.brand === currentProduct.brand
                )
            )
            .sort((a, b) => {

                const scoreA =
                    getRelationScore(a, currentProduct);

                const scoreB =
                    getRelationScore(b, currentProduct);

                return scoreB - scoreA;

            })
            .slice(0, 4);


    if (related.length === 0) {

        relatedSection.hidden = true;

        return;
    }


    relatedProducts.innerHTML = "";


    related.forEach(product => {

        const card =
            createProductCard(product);

        relatedProducts.appendChild(card);

    });

}



function getRelationScore(
    product,
    currentProduct
) {

    let score = 0;


    if (
        product.category ===
        currentProduct.category
    ) {
        score += 2;
    }


    if (
        product.brand ===
        currentProduct.brand
    ) {
        score += 1;
    }


    return score;
}
 

function renderQuantity(item) {
    return `<div class="quantity-control" role="group" aria-label="Cantidad de ${escapeHTML(item.name || item.model)}">
        <button type="button" data-quantity-step="-1" disabled aria-label="Quitar una pieza de ${escapeHTML(item.name || item.model)}">−</button>
        <label class="quantity-value"><input type="number" min="1" max="5" step="1" value="1" inputmode="numeric"
            data-quantity-for="${item.id}" disabled aria-label="Cantidad de ${escapeHTML(item.name || item.model)}"><span>pzas</span></label>
        <button type="button" data-quantity-step="1" disabled aria-label="Añadir una pieza de ${escapeHTML(item.name || item.model)}">+</button>
    </div>`;
}

function moveCollectionCard(input) {
    const list = document.querySelector('.outfit-list');
    const cards = [...list.children];
    cards.sort((a, b) =>
        Number(b.querySelector('[data-outfit-select]').checked) -
        Number(a.querySelector('[data-outfit-select]').checked) ||
        Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder)
    );
    cards.forEach(card => list.appendChild(card));
    input.focus({ preventScroll: true });
    if (input.checked) list.scrollLeft = 0;
}

function quantityReady(item) {
    const selection = orderSelection.get(item.id);
    if (!selection) return false;
    if (productSizes(item).length && (!productSizes(item).includes(selection.size) || sizeUnavailable(item, selection.size))) return false;
    return quantityLimit(item, selection.size) >= 1;
}

function syncQuantityLimit(item) {
    const input = document.querySelector(`[data-quantity-for="${item.id}"]`);
    const limit = quantityLimit(item, orderSelection.get(item.id)?.size);
    if (Number.isFinite(limit)) input.max = Math.max(0, limit);
    else input.removeAttribute('max');
    input.disabled = !quantityReady(item);
    input.closest('.quantity-control').classList.toggle('quantity-inactive', input.disabled);
    const selection = orderSelection.get(item.id);
    if (selection && !input.disabled) {
        selection.quantity = Math.max(1, Math.min(limit, Number.isSafeInteger(selection.quantity) ? selection.quantity : 1));
        input.value = selection.quantity;
    }
    updateQuantityButtons(input);
    const indicator = document.querySelector(`[data-low-stock-for="${item.id}"]`);
    if (indicator) {
        const stock = selection?.size ? variantStock(item, selection.size) : null;
        const text = Number.isInteger(stock) && stock > 0 && stock < 5
            ? stock === 1 ? 'Última pieza' : `Últimas ${stock} piezas`
            : '';
        if (indicator.textContent !== text) indicator.textContent = text;
    }
}

function setupQuantities() {
    document.querySelectorAll('[data-quantity-for]').forEach(input => {
        const id = Number(input.dataset.quantityFor);
        const item = products.find(p => p.id === id);
        const indicator = document.createElement('p');
        indicator.className = 'low-stock-note';
        indicator.dataset.lowStockFor = id;
        indicator.setAttribute('aria-live', 'polite');
        indicator.setAttribute('aria-atomic', 'true');
        input.closest('.size-quantity-row').after(indicator);
        syncQuantityLimit(item);
        input.addEventListener('input', () => {
            if (input.disabled || !quantityReady(item)) return;
            orderSelection.get(id).quantity = input.valueAsNumber;
            updateQuantityButtons(input);
            updateOrderSummary();
        });
        input.closest(".quantity-control").querySelectorAll("[data-quantity-step]").forEach(button => {
            button.addEventListener("click", () => {
                if (input.disabled || !quantityReady(item)) return;
                const current = Number.isSafeInteger(input.valueAsNumber) ? input.valueAsNumber : 1;
                const limit = quantityLimit(item, orderSelection.get(id)?.size);
                input.value = Math.max(1, Math.min(limit, current + Number(button.dataset.quantityStep)));
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
        });
    });
}

function updateQuantityButtons(input) {
    const controls = input.closest('.quantity-control');
    controls.querySelector('[data-quantity-step="-1"]').disabled = input.disabled || !(input.valueAsNumber > 1);
    controls.querySelector('[data-quantity-step="1"]').disabled = input.disabled || input.hasAttribute('max') && input.valueAsNumber >= Number(input.max);
}

function setupImageViewer() {
    const main = document.querySelector('#main-product-image');
    main.tabIndex = 0;
    main.setAttribute('role', 'button');
    main.setAttribute('aria-label', 'Ampliar foto de ' + (product.name || product.model));
    const dialog = document.createElement('dialog');
    dialog.className = 'image-viewer';
    dialog.setAttribute('aria-label', 'Vista ampliada del producto');
    dialog.innerHTML = '<div class="viewer-toolbar"><p>Foto del producto · Haz clic para ampliar</p><button type="button" class="viewer-close" aria-label="Cerrar foto">×</button></div><div class="viewer-stage"><img class="viewer-image" alt="" tabindex="0" role="button" aria-label="Acercar imagen" aria-pressed="false"></div>';
    document.body.appendChild(dialog);
    const img = dialog.querySelector('img');
    const stage = dialog.querySelector('.viewer-stage');
    const photos = getProductImages(product);
    let photoIndex = 0;
    if (photos.length > 1) {
        dialog.insertAdjacentHTML('beforeend', '<button type="button" class="viewer-arrow viewer-prev" aria-label="Foto anterior">‹</button><button type="button" class="viewer-arrow viewer-next" aria-label="Foto siguiente">›</button><span class="viewer-counter" role="status"></span>');
        dialog.querySelector('.viewer-prev').addEventListener('click', () => changePhoto(-1));
        dialog.querySelector('.viewer-next').addEventListener('click', () => changePhoto(1));
        dialog.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); changePhoto(event.key === 'ArrowLeft' ? -1 : 1);
            }
        });
    }
    function changePhoto(direction) {
        photoIndex = (photoIndex + direction + photos.length) % photos.length;
        resetZoom();
        img.src = photos[photoIndex];
        stage.scrollTop = 0; stage.scrollLeft = 0;
        dialog.querySelector('.viewer-counter').textContent = (photoIndex + 1) + ' / ' + photos.length;
    }
    let zoomed = false;
    function resetZoom() {
        zoomed = false;
        img.style.width = ''; img.style.height = '';
        stage.classList.remove('zoomed');
        img.setAttribute('aria-pressed', 'false');
        img.setAttribute('aria-label', 'Acercar imagen');
    }
    function open() {
        img.src = main.src; img.alt = main.alt;
        photoIndex = Math.max(0, photos.findIndex(path => new URL(path, document.baseURI).href === main.src));
        if (photos.length > 1) changePhoto(0);
        resetZoom(); dialog.showModal(); document.body.classList.add('viewer-open');
    }
    function zoom() {
        if (zoomed) { resetZoom(); return; }
        const rect = img.getBoundingClientRect();
        stage.classList.add('zoomed');
        img.style.width = rect.width * 2 + 'px'; img.style.height = rect.height * 2 + 'px';
        zoomed = true;
        img.setAttribute('aria-pressed', 'true'); img.setAttribute('aria-label', 'Alejar imagen');
        stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
        stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
    }
    main.addEventListener('click', open);
    main.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    img.addEventListener('click', zoom);
    img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoom(); } });
    dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { resetZoom(); document.body.classList.remove('viewer-open'); main.focus({preventScroll:true}); });
    window.addEventListener('resize', resetZoom);
}

function calculateOrder(selected) { return orderTotals(selected,orderSelection); }
