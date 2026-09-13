import {escapeHTML,getProductBadges,getProductPrice,isProductOnSale,getOriginalPrice} from './catalog-logic.js?v=badges-order-2';
export function getProductImages(product) {

    if (
        Array.isArray(product.images) &&
        product.images.length > 0
    ) {
        return product.images;
    }

    // Compatibilidad temporal por si algún producto
    // todavía usa image: "..."
    if (product.image) {
        return [product.image];
    }

    return [];
}


export function createProductCard(product) {

    const article =
        document.createElement("article");

    article.classList.add("product-card");


    const images =
        getProductImages(product);

    const primaryImage =
        images[0] ||
        "assets/img/producto-pendiente.svg";

    const secondaryImage =
        images.length > 1
            ? images[1]
            : null;

    const badges = getProductBadges(product);
    article.innerHTML = `
        <a href="producto.html?id=${product.id}">

            <div class="product-image">
                ${badges.length ? `<span class="product-badges">${badges.map(badge => `<span class="product-badge product-badge--${badge.kind}">${badge.label}</span>`).join('')}</span>` : ''}

                <img
                    class="
                        product-image-primary
                        ${secondaryImage ? "has-secondary" : ""}
                    "
                    src="${escapeHTML(primaryImage)}"
                    alt="${escapeHTML(product.name || product.model)}"
                >

                ${
                    secondaryImage
                        ? `
                            <img
                                class="product-image-secondary"
                                src="${escapeHTML(secondaryImage)}"
                                alt="${escapeHTML(product.name || product.model)} - segunda vista"
                            >
                        `
                        : ""
                }

</div>

            <div class="product-info">

                <p class="product-brand">
                    ${escapeHTML(product.brand)}
                </p>

                <h3>
                    ${escapeHTML(product.name || product.model)}
                </h3>

                <p class="product-price">${renderProductPrice(product)}</p>

            </div>

        </a>
    `;

    return article;
}

export function renderProductPrice(product) {
 const price=getProductPrice(product);
 if(price===null)return 'Precio próximamente';
 const money=value=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2,minimumFractionDigits:0}).format(value)+' MXN';
 return isProductOnSale(product)?`<del class="price-original" aria-label="Precio original">${money(getOriginalPrice(product))}</del> <span class="price-final" aria-label="Precio en oferta">${money(price)}</span>` : money(price);
}
