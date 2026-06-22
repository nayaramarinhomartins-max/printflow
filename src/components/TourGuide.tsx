import { useEffect, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export interface TourStep {
  element?: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

interface TourGuideProps {
  pageKey: string;
  steps: TourStep[];
}

export function TourGuide({ pageKey, steps }: TourGuideProps) {
  const hasAutoShown = useRef(false);
  const storageKey = `pf-tour-v1-${pageKey}`;

  function startTour() {
    const driverObj = driver({
      showProgress: true,
      progressText: "{{current}} de {{total}}",
      nextBtnText: "Próximo",
      prevBtnText: "Anterior",
      doneBtnText: "Entendido!",
      steps: steps.map((s) => ({
        element: s.element,
        popover: {
          title: s.title,
          description: s.description,
          side: s.side ?? "bottom",
          align: s.align ?? "start",
        },
      })),
      onDestroyStarted: () => {
        localStorage.setItem(storageKey, "1");
        driverObj.destroy();
      },
    });
    driverObj.drive();
  }

  useEffect(() => {
    if (hasAutoShown.current) return;
    const seen = localStorage.getItem(storageKey);
    if (seen) return;
    hasAutoShown.current = true;
    const timer = setTimeout(startTour, 900);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
      onClick={startTour}
      title="Abrir guia interativo"
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  );
}
