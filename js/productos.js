const products = [

    // ESSENTIALS - HOODIES

    {
        id: 1,
        brand: "Essentials",
        category: "Hoodies",
        model: "Stretch Lim",
        color: "Black",
        price: null,
        featured: true,
        image: ""
    },

    {
    id: 2,

    name: "Essentials Hoodie",

    brand: "Essentials",
    category: "Hoodies",

    model: "Modelo pendiente",
    color: "Light Oatmeal",

    price: null,

    material: "Pendiente",

    description: "...",

    sizes: ["S", "M", "L", "XL"],

    stock: {
        S: 1,
        M: 2,
        L: 0,
        XL: 1
    },

    featured: true,

    images: [
        "assets/img/essentials-light-oatmeal/01.png",
        "assets/img/essentials-light-oatmeal/02.png",
        "assets/img/essentials-light-oatmeal/03.png"
    ]
    },

    {
        id: 3,
        brand: "Essentials",
        category: "Hoodies",
        model: "Dark Oatmeal",
        color: "Dark Oatmeal",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 4,
        brand: "Essentials",
        category: "Hoodies",
        model: "Fleece Black",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 5,
        brand: "Essentials",
        category: "Hoodies",
        model: "Desert Sand",
        color: "Desert Sand",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 6,
        brand: "Essentials",
        category: "Hoodies",
        model: "Dusty Beige",
        color: "Dusty Beige",
        price: null,
        featured: false,
        image: ""
    },


    // ESSENTIALS - T-SHIRTS

    {
        id: 7,
        brand: "Essentials",
        category: "T-Shirts",
        model: "Stretch Lim",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 8,
        brand: "Essentials",
        category: "T-Shirts",
        model: "Light Oatmeal",
        color: "Light Oatmeal",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 9,
        brand: "Essentials",
        category: "T-Shirts",
        model: "Bright White",
        color: "White",
        price: null,
        featured: true,
        image: ""
    },

    {
        id: 10,
        brand: "Essentials",
        category: "T-Shirts",
        model: "Fleece Black",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 11,
        brand: "Essentials",
        category: "T-Shirts",
        model: "Dusty Beige",
        color: "Dusty Beige",
        price: null,
        featured: false,
        image: ""
    },


    // ESSENTIALS - PANTS

    {
        id: 12,
        brand: "Essentials",
        category: "Pants",
        model: "Dark Oatmeal",
        color: "Dark Oatmeal",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 13,
        brand: "Essentials",
        category: "Pants",
        model: "Desert Taupe",
        color: "Desert Taupe",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 14,
        brand: "Essentials",
        category: "Pants",
        model: "Dusty Beige",
        color: "Dusty Beige",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 15,
        brand: "Essentials",
        category: "Pants",
        model: "Fleece Black",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },


    // ESSENTIALS - SHORTS

    {
        id: 16,
        brand: "Essentials",
        category: "Shorts",
        model: "Desert Taupe",
        color: "Desert Taupe",
        price: null,
        featured: false,
        image: ""
    },


    // HELLSTAR

    {
        id: 17,
        brand: "Hellstar",
        category: "T-Shirts",
        model: "Paradise Graphic",
        color: "Black",
        price: null,
        featured: true,
        image: ""
    },

    {
        id: 18,
        brand: "Hellstar",
        category: "T-Shirts",
        model: "Graphic 02",
        color: "White",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 19,
        brand: "Hellstar",
        category: "T-Shirts",
        model: "Graphic 03",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },

    {
        id: 20,
        brand: "Hellstar",
        category: "T-Shirts",
        model: "Logo Graphic",
        color: "Black",
        price: null,
        featured: false,
        image: ""
    },


    // ACCESORIOS

    {
        id: 21,
        brand: "Van Cleef",
        category: "Accessories",
        model: "Pulsera Clover",
        color: "Black",
        material: "Plata 925",
        finish: "Plateado",
        price: null,
        featured: false,
        image: ""
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
        "https://placehold.co/600x800?text=Vant%27ara";

    const secondaryImage =
        images.length > 1
            ? images[1]
            : null;

    const stockLabel =
        getStockLabel(product);

    const totalStock =
        getTotalStock(product);

    article.innerHTML = `
        <a href="producto.html?id=${product.id}">

            <div class="product-image">

                ${
                    stockLabel
                        ? `
                            <span class="
                                stock-badge
                                ${totalStock === 0 ? "sold-out" : ""}
                            ">
                                ${stockLabel}
                            </span>
                        `
                    : ""
                }

                <img
                    class="
                        product-image-primary
                        ${secondaryImage ? "has-secondary" : ""}
                    "
                    src="${primaryImage}"
                    alt="${product.brand} ${product.model}"
                >

                ${
                    secondaryImage
                        ? `
                            <img
                                class="product-image-secondary"
                                src="${secondaryImage}"
                                alt="${product.brand} ${product.model} - segunda vista"
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
                    ${product.model}
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