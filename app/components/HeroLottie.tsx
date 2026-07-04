"use client";

import { useEffect, useState, type ComponentType } from "react";
import LottieModule from "lottie-react";

type LottieJson = Record<string, unknown>;
type LottieProps = {
  animationData: LottieJson;
  autoplay: boolean;
  loop: boolean;
  rendererSettings: { preserveAspectRatio: string };
};

const LottieView = LottieModule as unknown as ComponentType<LottieProps>;

export function HeroLottie() {
  const [animationData, setAnimationData] = useState<LottieJson | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/projects/kobolink-title/scene-1/lottie.json")
      .then((response) => response.json() as Promise<LottieJson>)
      .then((data) => {
        if (mounted) setAnimationData(data);
      })
      .catch(() => {
        if (mounted) setAnimationData(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!animationData) {
    return <span className="word-fallback">LIST FUND DECIDE SETTLE</span>;
  }

  return (
    <div className="lottie-words" aria-hidden="true">
      <LottieView animationData={animationData} autoplay loop rendererSettings={{ preserveAspectRatio: "xMinYMid meet" }} />
    </div>
  );
}
