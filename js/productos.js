const products = [
    {
        "id": 1,
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Strech Lim",
        "color": "Black",
        "price": 999,
        "featured": true,
        "name": "Essentials Hoodie Strech Lim",
        "images": [
            "assets/img/catalogo/essentials-hoodie-strech-lim.png"
        ],
        "collection": "strech-lim"
    },
    {
        "id": 2,
        "name": "Essentials Hoodie Light Oatmeal",
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Light Oatmeal",
        "color": "Light Oatmeal",
        "price": 999,
        "material": "Pendiente",
        "description": "...",
        "sizes": [
            "S",
            "M",
            "L",
            "XL"
        ],
        "stock": {
            "S": 1,
            "M": 2,
            "L": 0,
            "XL": 1
        },
        "featured": true,
        "images": [
            "assets/img/catalogo/essentials-hoodie-light-oatmeal.png"
        ],
        "collection": "light-oatmeal"
    },
    {
        "id": 3,
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Dark Oatmeal",
        "color": "Dark Oatmeal",
        "price": 999,
        "featured": false,
        "name": "Essentials Hoodie Dark Oatmeal",
        "images": [
            "assets/img/catalogo/essentials-hoodie-dark-oatmeal.png"
        ],
        "collection": "dark-oatmeal"
    },
    {
        "id": 4,
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Fleece Black",
        "color": "Black",
        "price": 1199,
        "featured": false,
        "name": "Essentials Hoodie Fleece Black",
        "images": [
            "assets/img/catalogo/essentials-hoodie-fleece-black.png"
        ],
        "collection": "fleece-black"
    },
    {
        "id": 5,
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Desert Sand",
        "color": "Desert Sand",
        "price": 1199,
        "featured": false,
        "name": "Essentials Hoodie Desert Sand",
        "images": [
            "assets/img/catalogo/essentials-hoodie-desert-sand.png"
        ],
        "collection": "desert-sand"
    },
    {
        "id": 6,
        "brand": "Essentials",
        "category": "Hoodies",
        "model": "Dusty Beige",
        "color": "Dusty Beige",
        "price": 1199,
        "featured": false,
        "name": "Essentials Hoodie Dusty Beige",
        "images": [
            "assets/img/catalogo/essentials-hoodie-dusty-beige.png"
        ],
        "collection": "dusty-beige"
    },
    {
        "id": 8,
        "brand": "Essentials",
        "category": "T-Shirts",
        "model": "Light Oatmeal",
        "color": "Light Oatmeal",
        "price": 899,
        "featured": false,
        "name": "Essentials T-shirt Light Oatmeal",
        "images": [
            "assets/img/catalogo/essentials-t-shirt-light-oatmeal.png"
        ],
        "collection": "light-oatmeal"
    },
    {
        "id": 9,
        "brand": "Essentials",
        "category": "T-Shirts",
        "model": "Bright White",
        "color": "White",
        "price": 899,
        "featured": true,
        "name": "Essentials T-shirt Bright White",
        "images": [
            "assets/img/catalogo/essentials-t-shirt-bright-white.jpg"
        ],
        "collection": "bright-white"
    },
    {
        "id": 10,
        "brand": "Essentials",
        "category": "T-Shirts",
        "model": "Fleece Black",
        "color": "Black",
        "price": 899,
        "featured": false,
        "name": "Essentials T-shirt Fleece Black",
        "images": [
            "assets/img/catalogo/essentials-t-shirt-fleece-black.jpg"
        ],
        "collection": "fleece-black"
    },
    {
        "id": 11,
        "brand": "Essentials",
        "category": "T-Shirts",
        "model": "Dusty Beige",
        "color": "Dusty Beige",
        "price": 999,
        "featured": false,
        "name": "Essentials T-shirt Dusty Beige",
        "images": [
            "assets/img/catalogo/essentials-t-shirt-dusty-beige.png"
        ],
        "collection": "dusty-beige"
    },
    {
        "id": 12,
        "brand": "Essentials",
        "category": "Pants",
        "model": "Dark Oatmeal",
        "color": "Dark Oatmeal",
        "price": 999,
        "featured": false,
        "name": "Essentials Pants Dark Oatmeal",
        "images": [
            "assets/img/catalogo/essentials-pants-dark-oatmeal.jpg"
        ],
        "collection": "dark-oatmeal"
    },
    {
        "id": 14,
        "brand": "Essentials",
        "category": "Pants",
        "model": "Dusty Beige",
        "color": "Dusty Beige",
        "price": 1199,
        "featured": false,
        "name": "Essentials Pants Dusty Beige",
        "images": [
            "assets/img/catalogo/essentials-pants-dusty-beige.jpg"
        ],
        "collection": "dusty-beige"
    },
    {
        "id": 15,
        "brand": "Essentials",
        "category": "Pants",
        "model": "Fleece Black",
        "color": "Black",
        "price": 1199,
        "featured": false,
        "name": "Essentials Pants Fleece Black",
        "images": [
            "assets/img/catalogo/essentials-pants-fleece-black.jpg"
        ],
        "collection": "fleece-black"
    },
    {
        "id": 16,
        "brand": "Essentials",
        "category": "Shorts",
        "model": "Desert Taupe",
        "color": "Desert Taupe",
        "price": 899,
        "featured": false,
        "name": "Essentials Short Desert Taupe",
        "images": [
            "assets/img/catalogo/essentials-short-desert-taupe.jpg"
        ],
        "collection": "desert-taupe"
    },
    {
        "id": 22,
        "featured": false,
        "name": "Essentials Short Fleece Black",
        "brand": "Essentials",
        "category": "Shorts",
        "model": "Fleece Black",
        "price": 899,
        "images": [
            "assets/img/catalogo/essentials-short-fleece-black.png"
        ],
        "collection": "fleece-black"
    },
    {
        "id": 23,
        "featured": false,
        "name": "Essentials Short Dusty Beige",
        "brand": "Essentials",
        "category": "Shorts",
        "model": "Dusty Beige",
        "price": 899,
        "images": [
            "assets/img/catalogo/essentials-short-dusty-beige.jpg"
        ],
        "collection": "dusty-beige"
    },
    {
        "id": 24,
        "featured": false,
        "name": "Essentials Short Strech Lim",
        "brand": "Essentials",
        "category": "Shorts",
        "model": "Strech Lim",
        "price": 899,
        "images": [
            "assets/img/catalogo/essentials-short-strech-lim.jpg"
        ],
        "collection": "strech-lim"
    },
    {
        "id": 25,
        "featured": false,
        "name": "Essentials Pants Light Health",
        "brand": "Essentials",
        "category": "Pants",
        "model": "Light Health",
        "price": 1199,
        "images": [
            "assets/img/catalogo/essentials-pants-light-health.png"
        ],
        "collection": "light-health"
    },
    {
        "id": 26,
        "featured": false,
        "name": "Alo Suéter Negro",
        "brand": "Alo",
        "category": "Sueter",
        "model": "Negro",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-sueter-negro.png"
        ]
    },
    {
        "id": 27,
        "featured": false,
        "name": "Alo Suéter Gris",
        "brand": "Alo",
        "category": "Sueter",
        "model": "Gris",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-sueter-gris.png"
        ]
    },
    {
        "id": 28,
        "featured": false,
        "name": "Alo Suéter Azul",
        "brand": "Alo",
        "category": "Sueter",
        "model": "Azul",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-sueter-azul.png"
        ]
    },
    {
        "id": 29,
        "featured": false,
        "name": "Alo Hoodie Azul",
        "brand": "Alo",
        "category": "Hoodies",
        "model": "Azul",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-hoodie-azul.png"
        ]
    },
    {
        "id": 30,
        "featured": false,
        "name": "Alo Hoodie Café",
        "brand": "Alo",
        "category": "Hoodies",
        "model": "Café",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-hoodie-cafe.png"
        ]
    },
    {
        "id": 31,
        "featured": false,
        "name": "Alo Hoodie Negro",
        "brand": "Alo",
        "category": "Hoodies",
        "model": "Negro",
        "price": 1399,
        "images": [
            "assets/img/catalogo/alo-hoodie-negro.png"
        ]
    },
    {
        "id": 32,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Oro-Negro",
        "model": "Oro-Negro",
        "price": 1699,
        "material": "Baño de oro",
        "description": "Pulsera bañada en oro, con detalles en color negro.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-dorado-negro.png"
        ]
    },
    {
        "id": 33,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Oro-Rosa",
        "model": "Oro-Rosa",
        "price": 1699,
        "material": "Baño de oro",
        "description": "Pulsera bañada en oro, con detalles en color rosa.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-dorado-rosa.png"
        ]
    },
    {
        "id": 34,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Oro-Azul",
        "model": "Oro-Azul",
        "price": 1699,
        "material": "Baño de oro",
        "description": "Pulsera bañada en oro, con detalles en color azul.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-dorado-azul.png"
        ]
    },
    {
        "id": 35,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Oro-Verde",
        "model": "Oro-Verde",
        "price": 1699,
        "material": "Baño de oro",
        "description": "Pulsera bañada en oro, con detalles en color verde.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-dorado-verde-1.png",
            "assets/img/catalogo/van-cleef-pulsera-dorado-verde-2.png"
        ]
    },
    {
        "id": 37,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Plata-Blanco/Negro",
        "model": "Plata-Blanco/Negro",
        "price": 1699,
        "material": "Plata",
        "description": "Pulsera hecha de plata, con detalles en color blanco y negro.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-blanco-negro.png"
        ]
    },
    {
        "id": 38,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Plata-Blanco/Azul",
        "model": "Plata-Blanco/Azul",
        "price": 1699,
        "material": "Plata",
        "description": "Pulsera hecha de plata, con detalles en color blanco y azul.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-blanco-azul.png"
        ]
    },
    {
        "id": 39,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Plata/Azul Celeste",
        "model": "Plata/Azul Celeste",
        "price": 1699,
        "material": "Plata",
        "description": "Pulsera hecha de plata, con detalles en color azul celeste.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-azul-bajito.png"
        ]
    },
    {
        "id": 40,
        "brand": "Van Cleef",
        "category": "Accessories",
        "name": "Van Cleef Pulsera Plata/Azul Marino",
        "model": "Plata/Azul Marino",
        "price": 1699,
        "material": "Plata",
        "description": "Pulsera hecha de plata, con detalles en color azul marino.",
        "sizes": [],
        "featured": false,
        "images": [
            "assets/img/catalogo/van-cleef-pulsera-azul-marino.png"
        ]
    }
];

const featuredContainer =
    document.querySelector("#featured-products");

function getProductImages(product) {

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


function getTotalStock(product) {

    if (
        product.stock &&
        typeof product.stock === "object"
    ) {

        return Object.values(product.stock)
            .reduce(
                (total, quantity) =>
                    total + (Number(quantity) || 0),
                0
            );
    }


    if (typeof product.stock === "number") {
        return product.stock;
    }


    return null;
}


function getStockLabel(product) {

    const totalStock =
        getTotalStock(product);


    if (totalStock === null) {
        return "";
    }

    if (totalStock <= 0) {
        return "Agotado";
    }

    if (totalStock === 1) {
        return "Última pieza";
    }

    if (totalStock === 2) {
        return "Últimas 2 piezas";
    }

    return "Disponible";
}


    
function createProductCard(product) {

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
                    src="${primaryImage}"
                    alt="${product.name || product.model}"
                >

                ${
                    secondaryImage
                        ? `
                            <img
                                class="product-image-secondary"
                                src="${secondaryImage}"
                                alt="${product.name || product.model} - segunda vista"
                            >
                        `
                        : ""
                }

</div>

            <div class="product-info">

                <p class="product-brand">
                    ${product.brand}
                </p>

                <h3>
                    ${product.name || product.model}
                </h3>

                <p class="product-price">
                    ${
                        product.price
                            ? `$${product.price} MXN`
                            : "Precio próximamente"
                    }
                </p>

            </div>

        </a>
    `;

    return article;
}


if (featuredContainer) {

    const featuredProducts =
        products.filter(
            product => product.featured
        );


    featuredProducts.forEach(product => {

        const card =
            createProductCard(product);

        featuredContainer.appendChild(card);

    });

}
