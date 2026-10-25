# AURELIA website

Static site: no build step. Upload this whole folder to any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, or your own domain).

- `index.html` — the page
- `assets/style.css`, `assets/main.js` — design and animations (GSAP 3.12.5 loads from cdnjs)
- `assets/shot-*.webp` — real AURELIA v1 screenshots (left sidebar/camera cropped out)

To preview locally: `python -m http.server` in this folder, then open http://localhost:8000.
