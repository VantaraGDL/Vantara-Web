import {catalogApi} from './catalog-api.js?v=supabase-2';
import {getTotalStock} from './catalog-logic.js?v=badges-1';
import {createProductCard} from './product-ui.js?v=badges-1';
let products=[];
let loadError=false;
const catalogContainer =
    document.querySelector("#catalog-products");

const categoryFilter = document.querySelector("#category-filter");
const stockOnly = document.querySelector("#stock-only");

const brandFilter =
    document.querySelector("#brand-filter");

let brandOptions = [];

const noProductsMessage =
    document.querySelector("#no-products");

const searchInput =
    document.querySelector("#search-input");

const sortFilter =
    document.querySelector("#sort-filter");

const catalogCount =
    document.querySelector("#catalog-count"); 


const requestedCategory = new URLSearchParams(window.location.search).get("category");
let selectedCategory = Array.from(categoryFilter.options).some(option => option.value === requestedCategory)
    ? requestedCategory : "all";
categoryFilter.value = selectedCategory;
const requestedBrand = new URLSearchParams(window.location.search).get("brand")?.trim();
let selectedBrand = requestedBrand || "all";
let searchTerm = "";
let selectedSort = "default";

function updateBrandOptions() {

    const availableOptions = brandOptions.filter(option => {
        if (option.value === "all" || (selectedCategory === "all" && option.value === requestedBrand)) {
            return true;
        }

        return products.some(product => (selectedCategory === "all" || product.category === selectedCategory) && product.brand === option.value);
    });

    if (!availableOptions.some(option => option.value === selectedBrand)) {
        selectedBrand = "all";
    }

    brandFilter.replaceChildren(...availableOptions);
    brandFilter.value = selectedBrand;

}

function renderCatalog() {
    if(loadError)return;

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
                matchesSearch &&
                (!stockOnly.checked || getTotalStock(product) > 0)
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

            const brandOrder = ["Essentials", "Van Cleef", "Alo"];
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

categoryFilter.addEventListener("change", () => {
    selectedCategory = categoryFilter.value;
    selectedBrand = "all";
    selectedSort = "default";
    sortFilter.value = "default";
    stockOnly.checked = false;
    updateBrandOptions();
    renderCatalog();
});
stockOnly.addEventListener("change", renderCatalog);
document.addEventListener("click", event => {
    const menu = document.querySelector(".sort-menu");
    if (!menu.contains(event.target)) menu.open = false;
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        const menu = document.querySelector(".sort-menu");
        if (menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
    }
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

async function loadCatalog() {
    catalogCount.textContent='Cargando catálogo…';
    catalogCount.setAttribute('role','status');
    try {
        products=await catalogApi.loadProducts();
        const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
        brandOptions=[option('all','Todas las marcas'),...[...new Set(products.map(p=>p.brand))].sort().map(name=>option(name,name))];
        if(requestedBrand && !brandOptions.some(o=>o.value===requestedBrand))brandOptions.push(option(requestedBrand,requestedBrand));
        const known=new Set([...categoryFilter.options].map(o=>o.value));
        for(const p of products)if(!known.has(p.category)){categoryFilter.append(option(p.category,p.categoryName));known.add(p.category);}
        noProductsMessage.textContent=products.length ? 'No se encontraron productos con estos filtros.' : 'No hay productos disponibles por el momento.';
        updateBrandOptions();renderCatalog();
        if(products.some(p=>p.imageError))catalogCount.textContent+=' · Algunas imágenes no pudieron cargarse.';
    } catch {
        loadError=true;catalogCount.textContent='';noProductsMessage.hidden=false;
        noProductsMessage.textContent='No se pudo cargar el catálogo. Recarga la página para reintentar.';
        noProductsMessage.setAttribute('role','alert');
    }
}
loadCatalog();
