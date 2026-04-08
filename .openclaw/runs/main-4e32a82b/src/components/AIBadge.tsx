import { Sparkles } from "lucide-react";

interface AIBadgeProps {
  className?: string;
}

export default function AIBadge({ className = "h-4 w-4" }: AIBadgeProps) {
  return <Sparkles aria-hidden="true" className={className} strokeWidth={1.9} />;
}
