import { useCallback, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Adds smooth scrolling, scroll reveals, and a physical drop-in animation.
 * Everything animates transform/opacity only to avoid layout thrashing.
 */
export function useMotionSystem(rootRef, viewKey) {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.9,
    });
    const updateScrollTrigger = () => ScrollTrigger.update();
    const updateLenis = (time) => lenis.raf(time * 1000);

    lenis.on("scroll", updateScrollTrigger);
    gsap.ticker.add(updateLenis);
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.off("scroll", updateScrollTrigger);
      gsap.ticker.remove(updateLenis);
      lenis.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return undefined;

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-gravity]",
        {
          autoAlpha: 0,
          y: -110,
          rotation: () => gsap.utils.random(-4, 4),
        },
        {
          autoAlpha: 1,
          y: 0,
          rotation: 0,
          duration: 1,
          ease: "bounce.out",
          stagger: 0.06,
          clearProps: "transform,opacity,visibility",
        },
      );

      gsap.utils.toArray("[data-reveal]").forEach((element) => {
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: 36 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
            scrollTrigger: {
              trigger: element,
              start: "top 88%",
              once: true,
            },
          },
        );
      });
    }, root);

    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(refreshFrame);
      context.revert();
    };
  }, [rootRef, viewKey]);
}

/**
 * Drops the current view under gravity, swaps it, then useMotionSystem
 * bounces the next view into place.
 */
export function useGravityNavigation(rootRef, activeView, setActiveView) {
  const isTransitioning = useRef(false);

  return useCallback(
    (nextView) => {
      if (nextView === activeView || isTransitioning.current) return;

      const root = rootRef.current;
      if (!root || prefersReducedMotion()) {
        setActiveView(nextView);
        return;
      }

      const elements = root.querySelectorAll("[data-gravity], [data-reveal]");
      if (!elements.length) {
        setActiveView(nextView);
        return;
      }

      isTransitioning.current = true;
      gsap.to(elements, {
        autoAlpha: 0,
        y: () => window.innerHeight * gsap.utils.random(0.38, 0.7),
        rotation: () => gsap.utils.random(-8, 8),
        duration: 0.52,
        ease: "power3.in",
        stagger: { amount: 0.12, from: "random" },
        overwrite: true,
        onComplete: () => {
          window.scrollTo({ top: 0 });
          setActiveView(nextView);
          isTransitioning.current = false;
        },
      });
    },
    [activeView, rootRef, setActiveView],
  );
}
