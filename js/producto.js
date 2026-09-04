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
            "https://placehold.co/900x1200?text=Vant%27ara"
            ];


    const price = product.price
        ? `$${product.price} MXN`
        : "Precio próximamente";


    const sizesHTML =
        createSizes(product);


    productDetail.innerHTML = `

       
        <div class="product-gallery">

            <div class="product-main-image">

                <img
                id="main-product-image"
                src="${images[0]}"
                alt="${product.brand} ${product.model}"
                >

            </div>

            <div class="product-thumbnails">

                ${images.map((image, index) => `
                    <button
                        class="thumbnail-button ${index === 0 ? "active" : ""}"
                        data-image="${image}"
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


            ${
                product.name
                    ? `
                        <p class="product-option-value">
                            ${product.model}
                        </p>
                    `
                    : ""
            }


            <p class="product-price-detail">
                ${price}
            </p>


            <div class="product-options">

                ${
                    product.color
                        ? `
                            <div class="product-option">

                                <p class="product-option-label">
                                    Color
                                </p>

                                <p class="product-option-value">
                                    ${product.color}
                                </p>

                            </div>
                        `
                        : ""
                }


                ${
                    product.material
                        ? `
                            <div class="product-option">

                                <p class="product-option-label">
                                    Material
                                </p>

                                <p class="product-option-value">
                                    ${product.material}
                                </p>

                            </div>
                        `
                        : ""
                }


                ${
                    sizesHTML
                        ? `
                            <div class="product-option">

                                <p class="product-option-label">
                                    Talla
                                </p>

                                <div class="size-list">
                                    ${sizesHTML}
                                </div>

                                <p
                                    id="stock-status"
                                    class="stock-status"
                                >
                                    Selecciona una talla
                                </p>
                            </div>
                        `
                        : ""
                }

            </div>


            <button
                id="contact-button"
                class="product-action"
            >
                Pedir producto
            </button>


            ${
                product.description
                    ? `
                        <div class="product-description">

                            <h2>
                                Descripción
                            </h2>

                            <p>
                                ${product.description}
                            </p>

                        </div>
                    `
                    : ""
            }

        </div>
    `;


    setupSizeButtons(product);

    setupContactButton(product);

    setupGallery();
}

function createSizes(product) {

    if (!product.sizes) {
        return "";
    }


    return product.sizes
        .map(size => {

            const stock =
                product.stock?.[size] ?? 0;


            const disabled =
                stock <= 0
                    ? "disabled"
                    : "";


            return `
                <button
                    class="size-button"
                    data-size="${size}"
                    ${disabled}
                >
                    ${size}
                </button>
            `;

        })
        .join("");

}

let selectedSize = null;


function setupSizeButtons(product) {

    const buttons =
        document.querySelectorAll(".size-button");

    const stockStatus =
        document.querySelector("#stock-status");


    buttons.forEach(button => {

        button.addEventListener("click", () => {

            buttons.forEach(button => {
                button.classList.remove("selected");
            });


            button.classList.add("selected");


            selectedSize =
                button.dataset.size;


            const stock =
                product.stock?.[selectedSize] ?? 0;


            if (!stockStatus) {
                return;
            }


            if (stock === 1) {

                stockStatus.textContent =
                    `${selectedSize} — Última pieza`;

            } else if (stock === 2) {

                stockStatus.textContent =
                    `${selectedSize} — Últimas 2 piezas`;

            } else {

                stockStatus.textContent =
                    `${selectedSize} — Disponible`;

            }

        });

    });

}

function setupContactButton(product) {

    const button =
        document.querySelector("#contact-button");


    button.addEventListener("click", () => {

        if (
            product.sizes &&
            !selectedSize
        ) {

            alert(
                "Selecciona una talla antes de continuar."
            );

            return;
        }


        let message =
            `Hola, me interesa ${product.brand} ${product.model}.`;


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
            });


            button.classList.add("active");

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