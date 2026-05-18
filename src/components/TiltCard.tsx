import { useRef, ReactNode, HTMLAttributes } from "react";

interface TiltCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  intensity?: number;
}

export function TiltCard({ children, intensity = 12, style, className, ...props }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * intensity;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * intensity;
    el.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${-y}deg) translateY(-8px) scale3d(1.02,1.02,1.02)`;
  };

  const onMouseLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "";
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ ...style, transition: "transform 0.18s cubic-bezier(0.22,1,0.36,1)", transformStyle: "preserve-3d", willChange: "transform" }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...props}
    >
      {children}
    </div>
  );
}
