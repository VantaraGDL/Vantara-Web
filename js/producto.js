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


const product =
    products.find(
        product => product.id === productId
    );


if (!product) {

    document.title = "Producto no encontrado | Vant'ara";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    productDetail.hidden = true;
    productError.hidden = false;
    relatedSection.hidden = true;

} else {

    renderProduct(product);
    renderRelatedProducts(product);

}



function renderProduct(product) {

    const images =
        product.images && product.images.length > 0
            ? product.images
            : [
            "assets/img/producto-pendiente.svg"
            ];


    const price = product.price
        ? `$${product.price} MXN`
        : "Precio próximamente";


    const sizesHTML =
        createSizes();


    productDetail.innerHTML = `

       
        <div class="product-gallery">

            <div class="product-main-image">

                <img
                id="main-product-image"
                src="${images[0]}"
                alt="${product.name || product.model}"
                >

            </div>

            <div class="product-thumbnails">

                ${images.map((image, index) => `
                    <button
                        class="thumbnail-button ${index === 0 ? "active" : ""}"
                        data-image="${image}"
                        aria-label="Ver imagen ${index + 1}"
                        aria-pressed="${index === 0}"
                    >
                        <img
                            src="${image}"
                            alt="Vista ${index + 1}"
                        >
                    </button>
                `).join("")}

            </div>

        </div>


        <div class="product-data">

            <p class="product-brand-detail">
                ${product.brand}
            </p>


            <h1>
                ${product.name || product.model}
            </h1>


            <p class="product-price-detail">
                ${price}
            </p>


            <div class="product-options">
                <div class="product-option">
                    <p class="product-option-label">Material</p>
                    <p class="product-option-value">
                        ${product.material?.trim() || "Pendiente"}
                    </p>
                </div>

                <div class="product-option">
                    <p class="product-option-label">Talla</p>
                    <div class="size-list">${sizesHTML}</div>
                    <p id="stock-status" class="stock-status" role="status">
                        Selecciona una talla
                    </p>
                </div>
            </div>


            <button
                id="contact-button"
                class="product-action"
            >
                Pedir producto
            </button>


            <details class="product-description">
                <summary><h2>Descripción</h2><span class="accordion-icon" aria-hidden="true"></span></summary>
                <p>
                    ${product.description?.trim() && !/^[.\s…]+$/.test(product.description)
                        ? product.description
                        : "Descripción pendiente."}
                </p>
            </details>

        </div>
    `;


    document.title = `${product.name || product.model} | Vant'ara`;
    document.querySelector('meta[name="description"]').content = `${product.name || product.model}. Consulta sus detalles, tallas y disponibilidad en Vant'ara.`;

    setupSizeButtons();

    setupContactButton(product);
    setupGallery();
}

function createSizes() {
    return ["S", "M", "L", "XL"].map(size => `
        <button class="size-button" aria-pressed="false" data-size="${size}">
            ${size}
        </button>
    `).join("");
}

let selectedSize = null;


function setupSizeButtons() {

    const buttons =
        document.querySelectorAll(".size-button");

    const stockStatus =
        document.querySelector("#stock-status");


    buttons.forEach(button => {

        button.addEventListener("click", () => {

            buttons.forEach(button => {
                button.classList.remove("selected");
                button.setAttribute("aria-pressed", "false");
            });


            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");


            selectedSize =
                button.dataset.size;


            if (stockStatus) {
                stockStatus.textContent = `Talla seleccionada: ${selectedSize}`;
            }

        });

    });

}

function setupContactButton(product) {

    const button =
        document.querySelector("#contact-button");


    button.addEventListener("click", () => {

        if (
            !selectedSize
        ) {

            alert(
                "Selecciona una talla antes de continuar."
            );

            return;
        }


        let message =
            `Hola, me interesa ${product.name || product.model}.`;


        if (selectedSize) {

            message +=
                ` Talla ${selectedSize}.`;

        }


        console.log(message);

        alert(message);

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
