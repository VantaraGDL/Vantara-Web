import {escapeHTML,knownPrice} from './catalog-logic.js?v=supabase-2';
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

    article.innerHTML = `
        <a href="producto.html?id=${product.id}">

            <div class="product-image">

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

                <p class="product-price">
                    ${
                        knownPrice(product)
                            ? `$${product.price} MXN`
                            : "Precio próximamente"
                    }
                </p>

            </div>

        </a>
    `;

    return article;
}


