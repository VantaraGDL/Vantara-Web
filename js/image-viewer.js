// Shared product/package viewer: native dialog, zoom, looping navigation and focus return.
export function createImageViewer(main, { photos, name, onChange }) {
    const nativeButton = main.tagName === 'BUTTON';
    if (!nativeButton) main.tabIndex = 0;
    if (!nativeButton) main.setAttribute('role', 'button');
    main.setAttribute('aria-label', 'Ampliar foto de ' + name);
    const dialog = document.createElement('dialog');
    dialog.className = 'image-viewer';
    dialog.setAttribute('aria-label', 'Vista ampliada');
    dialog.innerHTML = '<div class="viewer-toolbar"><p>Fotografía · Haz clic para ampliar</p><button type="button" class="viewer-close" aria-label="Cerrar foto">×</button></div><div class="viewer-stage"><img class="viewer-image" alt="" tabindex="0" role="button" aria-label="Acercar imagen" aria-pressed="false"></div>';
    document.body.appendChild(dialog);
    const img = dialog.querySelector('img');
    const stage = dialog.querySelector('.viewer-stage');

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
        const counter = dialog.querySelector('.viewer-counter');
        if (counter) counter.textContent = (photoIndex + 1) + ' / ' + photos.length;
        onChange?.(photoIndex);
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
        const source = nativeButton ? main.querySelector('img') : main;
        img.src = source.src; img.alt = source.alt;
        photoIndex = Math.max(0, photos.findIndex(path => new URL(path, document.baseURI).href === source.src));
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
    if (!nativeButton) main.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    img.addEventListener('click', zoom);
    img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoom(); } });
    dialog.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { resetZoom(); document.body.classList.remove('viewer-open'); if (main.isConnected) main.focus({preventScroll:true}); });
    window.addEventListener('resize', resetZoom);

    return () => { if (dialog.open) dialog.close(); dialog.remove(); window.removeEventListener('resize', resetZoom); main.removeEventListener('click', open); };
}
