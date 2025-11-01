import { useState } from 'react';
import { Button } from './ui/button';

interface LandingScreenProps {
  onStart: () => void;
}

export default function LandingScreen({ onStart }: LandingScreenProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleStart = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onStart();
    }, 1000);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-background">
      {/* CRT scanlines effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.15) 2px, rgba(255, 0, 0, 0.15) 4px)'
        }}
      />
      
      <div className={`flex flex-col items-center gap-8 ${isAnimating ? 'fly-up' : ''}`}>
        <div className="space-y-6 text-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl text-primary leading-tight px-4 tracking-[0.3em]">
            SKYTRACK
          </h1>
          
          <p className="text-xs md:text-sm text-muted-foreground tracking-widest px-4">
            REAL-TIME GLOBAL AIRCRAFT TRACKING
          </p>
        </div>
        
        <Button
          onClick={handleStart}
          variant="default"
          size="lg"
          className="mt-8 px-8 py-6 text-sm tracking-wider bg-primary hover:bg-war-glow border-2 border-war-glow text-primary-foreground transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,0,0,0.5)]"
        >
          SELECT COUNTRY
        </Button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground tracking-wider">
        WLDN x Builder's Brew | HackTheBurgh 2025 ©
      </div>

      {/* Red glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-war-blood/10 to-transparent pointer-events-none" />
    </div>
  );
}
