import { createImageViewer } from './image-viewer.js?v=package-gallery-1';

export function createPackageGallery(pack) {
  const photos = [...pack.images];
  const fallback = 'assets/img/producto-pendiente.svg';
  const element = document.createElement('div');
  element.className = 'product-gallery package-gallery';
  const stage = document.createElement('div'); stage.className = 'package-gallery-stage';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'package-gallery-open';
  const image = document.createElement('img'); image.alt = pack.name; image.decoding = 'async';
  open.append(image); stage.append(open); element.append(stage);
  let index = 0;
  const thumbs = [];
  image.addEventListener('error', () => {
    if (photos[index] === fallback) return;
    photos[index] = fallback; image.src = fallback;
    const thumb = thumbs[index]?.querySelector('img');
    if (thumb) thumb.src = fallback;
  });
  function select(next) {
    index = (next + photos.length) % photos.length;
    image.src = photos[index];
    thumbs.forEach((button, i) => {
      button.classList.toggle('active', i === index);
      button.setAttribute('aria-current', String(i === index));
    });
  }
  if (photos.length > 1) {
    const strip = document.createElement('div'); strip.className = 'package-gallery-thumbs';
    strip.setAttribute('aria-label', 'Fotografías del paquete');
    photos.forEach((url, i) => {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', `Ver fotografía ${i + 1}`);
      const thumb = document.createElement('img'); thumb.src = url; thumb.alt = ''; thumb.decoding = 'async';
      thumb.addEventListener('error', () => {
        photos[i] = fallback; thumb.src = fallback;
        if (index === i) image.src = fallback;
      }, {once:true});
      button.append(thumb); button.addEventListener('click', () => select(i)); thumbs.push(button); strip.append(button);
    });
    element.prepend(strip);
    element.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); select(index + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    });
  }
  select(0);
  const dispose = createImageViewer(open, { photos, name: pack.name, onChange: select });
  return { element, dispose };
}
