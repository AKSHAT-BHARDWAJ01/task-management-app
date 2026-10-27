# TaskFlow motion system

## Recommended free stack

- **GSAP** — timelines, transform-only gravity transitions, and reliable sequencing.
- **ScrollTrigger** (included with GSAP) — reveal elements only when they enter the viewport.
- **Lenis** (MIT) — smooth wheel scrolling synchronized with ScrollTrigger.
- **Native CSS** — glass, rainbow accents, hover polish, and reduced-motion fallback.

This keeps the runtime to two packages. A physics or WebGL dependency is intentionally
omitted until a specific interaction needs it; the current effects stay GPU-friendly and
do not add a permanent canvas render loop.

## React / Vite integration

Install:

```sh
npm install gsap lenis
```

`src/motion/useMotionSystem.js` owns initialization and cleanup. Add:

- `data-gravity` to blocks that should fall/bounce during a view transition.
- `data-reveal` to blocks that should reveal on scroll.
- `motion-glass` to selected cards (not every surface).

The root page calls `useMotionSystem(rootRef, activeView)` and uses
`useGravityNavigation(...)` instead of changing the view directly.

## Plain HTML / CSS / JS starter (no build step)

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.27/dist/lenis.min.js"></script>

<section id="one">
  <article class="glass" data-gravity data-reveal>
    <h2>Physical, not decorative</h2>
    <p>This card reveals on scroll and can participate in a gravity transition.</p>
  </article>
</section>

<script>
  gsap.registerPlugin(ScrollTrigger);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduced) {
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    gsap.utils.toArray("[data-reveal]").forEach((element) => {
      gsap.from(element, {
        opacity: 0,
        y: 36,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: element, start: "top 88%", once: true },
      });
    });
  }

  // Call before replacing a section; invoke swapSection in onComplete.
  function gravityTransition(swapSection) {
    if (reduced) return swapSection();
    gsap.to("[data-gravity]", {
      opacity: 0,
      y: () => innerHeight * gsap.utils.random(0.4, 0.7),
      rotation: () => gsap.utils.random(-8, 8),
      duration: 0.52,
      ease: "power3.in",
      stagger: { amount: 0.12, from: "random" },
      onComplete: swapSection,
    });
  }
</script>
```

```css
.glass {
  background: linear-gradient(145deg, rgb(30 42 74 / 0.72), rgb(20 29 55 / 0.62));
  border: 1px solid rgb(255 255 255 / 0.14);
  border-radius: 1rem;
  box-shadow: 0 1.4rem 3.5rem rgb(0 0 0 / 0.28);
  backdrop-filter: blur(18px) saturate(130%);
  transition: transform 240ms ease, border-color 240ms ease;
}
.glass:hover {
  border-color: rgb(165 180 252 / 0.34);
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Next.js adaptation

Put the hook in a client component (`"use client"`). Keep the GSAP/Lenis imports in that
component, or load it with `dynamic(..., { ssr: false })`, because animation setup requires
`window`. Keep cleanup from the hook so route changes do not duplicate tickers or triggers.
