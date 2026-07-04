"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector(".landing-shell");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const context = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { duration: 0.78, ease: "power3.out" } });
      intro
        .from(".nav-animate", { autoAlpha: 0, y: -14, stagger: 0.06 })
        .from(".hero-line", { autoAlpha: 0, y: 34, stagger: 0.08 }, "<0.12")
        .from(".map-shell", { autoAlpha: 0, scale: 0.94, duration: 1.1, ease: "power2.out" }, "<0.18")
        .from(".metric-tile", { autoAlpha: 0, y: 24, stagger: 0.05 }, "<0.34");

      gsap.utils.toArray<HTMLElement>(".reveal-block").forEach((element, index) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 46,
          immediateRender: false,
          duration: 0.84,
          ease: "power3.out",
          scrollTrigger: {
            trigger: element,
            start: "top 78%",
            toggleActions: "play none none none",
            refreshPriority: index,
          },
        });
      });

      gsap.from(".story-card", {
        autoAlpha: 0,
        y: 60,
        immediateRender: false,
        stagger: 0.08,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".story-grid",
          start: "top 76%",
          toggleActions: "play none none none",
        },
      });

      gsap.to(".strip-line", {
        xPercent: -18,
        ease: "none",
        scrollTrigger: {
          trigger: ".settlement-strip",
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      });
    }, root);

    return () => context.revert();
  }, []);

  return null;
}