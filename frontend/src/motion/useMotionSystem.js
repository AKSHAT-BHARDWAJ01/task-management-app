import { useCallback, useLayoutEffect } from "react";
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
        const alreadyVisible = element.getBoundingClientRect().top < window.innerHeight * 0.96;
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: 28 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.45,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
            scrollTrigger: alreadyVisible
              ? undefined
              : { trigger: element, start: "top 92%", once: true },
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
 * Switches the visible page immediately. A delayed animation used to ignore
 * later clicks, so the sidebar could land on the wrong view or stop responding.
 */
export function useGravityNavigation(_rootRef, activeView, setActiveView) {
  return useCallback(
    (nextView) => {
      if (!nextView || nextView === activeView) return;
      window.scrollTo({ top: 0, left: 0 });
      setActiveView(nextView);
    },
    [activeView, setActiveView],
  );
}
