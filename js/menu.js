(() => {
    const toggle = document.querySelector('#menu-toggle');
    const menu = document.querySelector('#mobile-menu');
    const close = document.querySelector('#mobile-menu-close');
    if (!toggle || !menu || !close) return;
    const mobile = window.matchMedia('(max-width: 650px)');
    let background = [];
    menu.inert = true;
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Menú de navegación');
    menu.setAttribute('aria-modal', 'true');
    function closeMenu(restoreFocus = true) {
        if (!menu.classList.contains('open')) return;
        menu.classList.remove('open');
        menu.style.visibility = '';
        document.body.classList.remove('menu-open');
        background.forEach(([element, wasInert]) => { element.inert = wasInert; });
        background = [];
        if (restoreFocus && mobile.matches) toggle.focus();
        else if (menu.contains(document.activeElement)) document.querySelector('#contenido')?.focus();
        menu.inert = true;
        menu.setAttribute('aria-hidden', 'true');
        toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', () => {
        if (!mobile.matches) return;
        background = [...document.body.children].filter(element => element !== menu && element.tagName !== 'SCRIPT').map(element => [element, element.inert]);
        menu.inert = false;
        menu.setAttribute('aria-hidden', 'false');
        menu.classList.add('open');
        menu.style.visibility = 'visible';
        document.body.classList.add('menu-open');
        toggle.setAttribute('aria-expanded', 'true');
        close.focus();
        background.forEach(([element]) => { element.inert = true; });
    });
    close.addEventListener('click', () => closeMenu());
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', event => {
        if (!menu.classList.contains('open')) return;
        if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
        if (event.key !== 'Tab') return;
        const items = [...menu.querySelectorAll('a[href], button:not([disabled])')];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    mobile.addEventListener('change', () => { if (!mobile.matches) closeMenu(false); });
})();

