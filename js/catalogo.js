const catalogContainer =
    document.querySelector("#catalog-products");

const categoryButtons =
    document.querySelectorAll(".filter-button");

const brandFilter =
    document.querySelector("#brand-filter");

const brandOptions =
    Array.from(brandFilter.options);

const noProductsMessage =
    document.querySelector("#no-products");

const searchInput =
    document.querySelector("#search-input");

const sortFilter =
    document.querySelector("#sort-filter");

const catalogCount =
    document.querySelector("#catalog-count"); 


let selectedCategory = "all";
let selectedBrand = "all";
let searchTerm = "";
let selectedSort = "default";

function updateBrandOptions() {

    const availableOptions = brandOptions.filter(option => {
        if (option.value === "all" || selectedCategory === "all") {
            return true;
        }

        return selectedCategory === "Accessories"
            ? option.value === "Van Cleef"
            : option.value !== "Van Cleef";
    });

    if (!availableOptions.some(option => option.value === selectedBrand)) {
        selectedBrand = "all";
    }

    brandFilter.replaceChildren(...availableOptions);
    brandFilter.value = selectedBrand;

}

function renderCatalog() {

    catalogContainer.innerHTML = "";


    let filteredProducts =
        products.filter(product => {

            const matchesCategory =
                selectedCategory === "all" ||
                product.category === selectedCategory;


            const matchesBrand =
                selectedBrand === "all" ||
                product.brand === selectedBrand;


            const matchesSearch =
                productMatchesSearch(
                    product,
                    searchTerm
                );


            return (
                matchesCategory &&
                matchesBrand &&
                matchesSearch
            );

        });


    filteredProducts =
        sortProducts(filteredProducts);


    catalogCount.textContent =
        filteredProducts.length === 1
            ? "1 producto"
            : `${filteredProducts.length} productos`;


    if (filteredProducts.length === 0) {

        noProductsMessage.hidden = false;

        return;
    }


    noProductsMessage.hidden = true;


    filteredProducts.forEach(product => {

        const card =
            createProductCard(product);

        catalogContainer.appendChild(card);

    });

}

function productMatchesSearch(
    product,
    search
) {

    if (!search) {
        return true;
    }


    const categoryAliases = {

        "Sueter": "sueter suéter sueteres suéteres sweater sweaters",

        "T-Shirts":
            "playera playeras camiseta camisetas tshirt tshirts",

        "Hoodies":
            "hoodie hoodies sudadera sudaderas",

        "Pants":
            "pants pantalon pantalones jogger joggers",

        "Shorts":
            "short shorts",

        "Accessories":
            "accesorio accesorios pulsera pulseras"

    };


    const searchableText = [

        product.name,
        product.brand,
        product.category,
        product.model,
        product.color,
        product.material,
        product.finish,

        categoryAliases[
            product.category
        ]

    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


    return searchableText.includes(
        search.toLowerCase()
    );

}

function sortProducts(productList) {

    const sorted =
        [...productList];


    switch (selectedSort) {

        case "newest":

            return sorted.sort(
                (a, b) =>
                    b.id - a.id
            );


        case "az":

            return sorted.sort(
                (a, b) =>
                    getProductName(a)
                        .localeCompare(
                            getProductName(b)
                        )
            );


        case "price-asc":

            return sorted.sort(
                (a, b) =>
                    comparePrice(
                        a,
                        b,
                        "asc"
                    )
            );


        case "price-desc":

            return sorted.sort(
                (a, b) =>
                    comparePrice(
                        a,
                        b,
                        "desc"
                    )
            );


        default:

            const brandOrder = ["Essentials", "Hellstar", "Van Cleef", "Alo"];
            const categoryOrder = [
                "Hoodies", "T-Shirts", "Pants", "Shorts", "Sueter", "Accessories"
            ];
            const position = (order, value) => {
                const index = order.indexOf(value);
                return index === -1 ? order.length : index;
            };

            return sorted.sort((a, b) =>
                position(brandOrder, a.brand) - position(brandOrder, b.brand) ||
                a.brand.localeCompare(b.brand) ||
                position(categoryOrder, a.category) - position(categoryOrder, b.category)
            );

    }

}

function getProductName(product) {

    return (
        product.name ||
        product.model ||
        product.brand ||
        ""
    );

}

function comparePrice(
    a,
    b,
    direction
) {

    const priceA =
        a.price === null ||
        a.price === undefined
            ? null
            : Number(a.price);


    const priceB =
        b.price === null ||
        b.price === undefined
            ? null
            : Number(b.price);


    /*
        Los productos sin precio
        siempre se van al final.
    */

    if (
        priceA === null &&
        priceB === null
    ) {
        return 0;
    }


    if (priceA === null) {
        return 1;
    }


    if (priceB === null) {
        return -1;
    }


    return direction === "asc"
        ? priceA - priceB
        : priceB - priceA;

}

categoryButtons.forEach(button => {

    button.addEventListener("click", () => {

        categoryButtons.forEach(button => {
            button.classList.remove("active");
            button.setAttribute("aria-pressed", "false");
        });


        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");


        selectedCategory =
            button.dataset.category;

        updateBrandOptions();

        renderCatalog();

    });

});


brandFilter.addEventListener("change", () => {

    selectedBrand =
        brandFilter.value;

    renderCatalog();

});


searchInput.addEventListener(
    "input",
    () => {

        searchTerm =
            searchInput.value.trim();

        renderCatalog();

    }
);


sortFilter.addEventListener(
    "change",
    () => {

        selectedSort =
            sortFilter.value;

        renderCatalog();

    }
);

updateBrandOptions();
renderCatalog();
